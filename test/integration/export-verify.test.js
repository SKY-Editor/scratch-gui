import fs from 'fs';
import JSZip from '@turbowarp/jszip';

import {detectFormat, FORMAT, readZipJson} from '../../src/lib/project-formats/detect';
import {adaptToSb3} from '../../src/lib/project-formats/index';
import {exportProjectArchive} from '../../src/lib/project-formats/export-formats';

const SAMPLE = 'C:\\Users\\midoo\\Downloads\\标准Scratch作品.sb3';
const RJ_SAMPLE = 'C:\\Users\\midoo\\Downloads\\作品.rj';

// 样本文件属于本地手工准备的第三方工程，缺失时整组跳过，避免污染 CI。
const HAS_SAMPLES = fs.existsSync(SAMPLE) && fs.existsSync(RJ_SAMPLE);
const describeWithSamples = HAS_SAMPLES ? describe : describe.skip;

const toBlob = bytes => new Blob([bytes], {type: 'application/octet-stream'});
const readBytes = async blob => new Uint8Array(await blob.arrayBuffer());

const summarize = project => ({
    targetCount: project.targets.length,
    names: project.targets.map(target => target.name),
    costumes: project.targets.map(target => target.costumes.map(c => c.name)),
    sounds: project.targets.map(target => target.sounds.map(s => s.name)),
    variables: project.targets.map(target => Object.keys(target.variables).sort()),
    blockCounts: project.targets.map(target => Object.keys(target.blocks).length),
    opcodes: project.targets.map(target => Object.keys(target.blocks).sort()
        .map(id => target.blocks[id].opcode))
});

describeWithSamples('导出写回：sb3 -> .star/.rj -> 读回', () => {
    let baseline;
    let sb3Bytes;

    beforeAll(async () => {
        sb3Bytes = new Uint8Array(fs.readFileSync(SAMPLE));
        const zip = await JSZip.loadAsync(sb3Bytes);
        baseline = summarize(await readZipJson(zip, 'project.json'));
    });

    const roundTrip = async format => {
        const blob = await exportProjectArchive(toBlob(sb3Bytes), format, {title: '往返测试'});
        const bytes = await readBytes(blob);
        const zip = await JSZip.loadAsync(bytes);
        const detected = await detectFormat(zip);
        const rebaked = await adaptToSb3(zip, detected);
        const rezip = await JSZip.loadAsync(rebaked);
        return {
            detected,
            files: Object.keys(zip.files).filter(name => !zip.files[name].dir),
            project: await readZipJson(rezip, 'project.json')
        };
    };

    test('sb3 原样透传', async () => {
        const blob = await exportProjectArchive(toBlob(sb3Bytes), FORMAT.SB3, {title: 'works'});
        const zip = await JSZip.loadAsync(await readBytes(blob));
        expect(await detectFormat(zip)).toBe(FORMAT.SB3);
        expect(summarize(await readZipJson(zip, 'project.json'))).toEqual(baseline);
    });

    test('.star 写回后可被读回且结构一致', async () => {
        const result = await roundTrip(FORMAT.STAR);
        expect(result.detected).toBe(FORMAT.STAR);
        expect(result.files).toContain('star.json');
        expect(result.files).toContain('project.base.json');
        expect(result.files.some(name => /^blocks\/t\d+\/c\d+\.json$/.test(name))).toBe(true);
        expect(summarize(result.project)).toEqual(baseline);
    });

    test('.rj 写回后可被读回且结构一致', async () => {
        const result = await roundTrip(FORMAT.RJ);
        expect(result.detected).toBe(FORMAT.RJ);
        expect(result.files).toContain('manifest.json');
        expect(result.files).toContain('targets/0.json');
        expect(result.files).toContain('blocks/0.json');
        expect(result.files.some(name => name.startsWith('assets/'))).toBe(true);
        expect(summarize(result.project)).toEqual(baseline);
    });

    // 用真实的 .rj 工程（含素材、两个角色）走完整的「读入 -> 导出 -> 再读回」，
    // 覆盖简单样本触发不到的素材与多目标场景。
    test('真实 .rj 工程导入后再导出 .star 仍保真', async () => {
        const rjBytes = new Uint8Array(fs.readFileSync(RJ_SAMPLE));
        const rjZip = await JSZip.loadAsync(rjBytes);
        const rjFormat = await detectFormat(rjZip);
        expect(rjFormat).toBe(FORMAT.RJ);

        const importedSb3 = await adaptToSb3(rjZip, rjFormat);
        const importedZip = await JSZip.loadAsync(importedSb3);
        const imported = summarize(await readZipJson(importedZip, 'project.json'));

        const exported = await exportProjectArchive(
            toBlob(importedSb3), FORMAT.STAR, {title: '真实工程'});
        const exportedZip = await JSZip.loadAsync(await readBytes(exported));
        expect(await detectFormat(exportedZip)).toBe(FORMAT.STAR);

        const rebaked = await adaptToSb3(exportedZip, FORMAT.STAR);
        const rebakedZip = await JSZip.loadAsync(rebaked);
        expect(summarize(await readZipJson(rebakedZip, 'project.json'))).toEqual(imported);
    });
});
