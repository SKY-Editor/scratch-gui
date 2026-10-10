import LazyScratchBlocks from './tw-lazy-scratch-blocks';

/**
 * Connect scratch blocks with the vm
 * @param {VirtualMachine} vm - The scratch vm
 * @return {ScratchBlocks} ScratchBlocks connected with the vm
 */
export default function (vm) {
    const ScratchBlocks = LazyScratchBlocks.get();
    const jsonForMenuBlock = function (name, menuOptionsFn, colors, start) {
        return {
            message0: '%1',
            args0: [
                {
                    type: 'field_dropdown',
                    name: name,
                    options: function () {
                        return start.concat(menuOptionsFn());
                    }
                }
            ],
            inputsInline: true,
            output: 'String',
            colour: colors.secondary,
            colourSecondary: colors.secondary,
            colourTertiary: colors.tertiary,
            colourQuaternary: colors.quaternary,
            outputShape: ScratchBlocks.OUTPUT_SHAPE_ROUND
        };
    };

    const jsonForHatBlockMenu = function (hatName, name, menuOptionsFn, colors, start) {
        return {
            message0: hatName,
            args0: [
                {
                    type: 'field_dropdown',
                    name: name,
                    options: function () {
                        return start.concat(menuOptionsFn());
                    }
                }
            ],
            colour: colors.primary,
            colourSecondary: colors.secondary,
            colourTertiary: colors.tertiary,
            colourQuaternary: colors.quaternary,
            extensions: ['shape_hat']
        };
    };


    const jsonForSensingMenus = function (menuOptionsFn) {
        return {
            message0: ScratchBlocks.Msg.SENSING_OF,
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PROPERTY',
                    options: function () {
                        return menuOptionsFn();
                    }

                },
                {
                    type: 'input_value',
                    name: 'OBJECT'
                }
            ],
            output: true,
            colour: ScratchBlocks.Colours.sensing.primary,
            colourSecondary: ScratchBlocks.Colours.sensing.secondary,
            colourTertiary: ScratchBlocks.Colours.sensing.tertiary,
            colourQuaternary: ScratchBlocks.Colours.sensing.quaternary,
            outputShape: ScratchBlocks.OUTPUT_SHAPE_ROUND
        };
    };

    const soundsMenu = function () {
        let menu = [['', '']];
        if (vm.editingTarget && vm.editingTarget.sprite.sounds.length > 0) {
            menu = vm.editingTarget.sprite.sounds.map(sound => [sound.name, sound.name]);
        }
        menu.push([
            ScratchBlocks.ScratchMsgs.translate('SOUND_RECORD', 'record...'),
            ScratchBlocks.recordSoundCallback
        ]);
        return menu;
    };

    const costumesMenu = function () {
        if (vm.editingTarget && vm.editingTarget.getCostumes().length > 0) {
            return vm.editingTarget.getCostumes().map(costume => [costume.name, costume.name]);
        }
        return [['', '']];
    };

    const backdropsMenu = function () {
        const next = ScratchBlocks.ScratchMsgs.translate('LOOKS_NEXTBACKDROP', 'next backdrop');
        const previous = ScratchBlocks.ScratchMsgs.translate('LOOKS_PREVIOUSBACKDROP', 'previous backdrop');
        const random = ScratchBlocks.ScratchMsgs.translate('LOOKS_RANDOMBACKDROP', 'random backdrop');
        if (vm.runtime.targets[0] && vm.runtime.targets[0].getCostumes().length > 0) {
            return vm.runtime.targets[0].getCostumes().map(costume => [costume.name, costume.name])
                .concat([[next, 'next backdrop'],
                    [previous, 'previous backdrop'],
                    [random, 'random backdrop']]);
        }
        return [['', '']];
    };

    const backdropNamesMenu = function () {
        const stage = vm.runtime.getTargetForStage();
        if (stage && stage.getCostumes().length > 0) {
            return stage.getCostumes().map(costume => [costume.name, costume.name]);
        }
        return [['', '']];
    };

    const spriteMenu = function () {
        const sprites = [];
        for (const targetId in vm.runtime.targets) {
            if (!Object.prototype.hasOwnProperty.call(vm.runtime.targets, targetId)) continue;
            if (vm.runtime.targets[targetId].isOriginal) {
                if (!vm.runtime.targets[targetId].isStage) {
                    if (vm.runtime.targets[targetId] === vm.editingTarget) {
                        continue;
                    }
                    sprites.push([vm.runtime.targets[targetId].sprite.name, vm.runtime.targets[targetId].sprite.name]);
                }
            }
        }
        return sprites;
    };

    const cloneMenu = function () {
        if (vm.editingTarget && vm.editingTarget.isStage) {
            const menu = spriteMenu();
            if (menu.length === 0) {
                return [['', '']]; // Empty menu matches Scratch 2 behavior
            }
            return menu;
        }
        const myself = ScratchBlocks.ScratchMsgs.translate('CONTROL_CREATECLONEOF_MYSELF', 'myself');
        return [[myself, '_myself_']].concat(spriteMenu());
    };

    // BilupBlocks: assets 素材积木颜色与动态菜单
    if (!ScratchBlocks.Colours.assets) {
        ScratchBlocks.Colours.assets = {
            primary: '#6E7A8A',
            secondary: '#5E6977',
            tertiary: '#4F5866',
            quaternary: '#4F5866'
        };
    }
    if (!ScratchBlocks.Categories.assets) {
        ScratchBlocks.Categories.assets = 'assets';
    }
    const assetsMenu = function () {
        if (vm.runtime.assetManager && vm.runtime.assetManager.assets.length > 0) {
            return vm.runtime.assetManager.assets.map(asset => [asset.name, asset.name]);
        }
        return [['', '']];
    };
    const assetsColors = ScratchBlocks.Colours.assets;

    const soundColors = ScratchBlocks.Colours.sounds;

    const looksColors = ScratchBlocks.Colours.looks;

    const motionColors = ScratchBlocks.Colours.motion;

    const sensingColors = ScratchBlocks.Colours.sensing;

    const controlColors = ScratchBlocks.Colours.control;

    const eventColors = ScratchBlocks.Colours.event;

    ScratchBlocks.Blocks.sound_sounds_menu.init = function () {
        const json = jsonForMenuBlock('SOUND_MENU', soundsMenu, soundColors, []);
        this.jsonInit(json);
    };

    // BilupBlocks: 注册 assets 素材积木（SKY scratch-blocks 构建产物中无定义，需动态注册）
    ScratchBlocks.Blocks.assets_menu = {
        init: function () {
            const json = jsonForMenuBlock('ASSET', assetsMenu, assetsColors, []);
            this.jsonInit(json);
        }
    };
    ScratchBlocks.Blocks.assets_load = {
        init: function () {
            this.jsonInit({
                message0: '加载素材 %1 为 %2',
                args0: [
                    {type: 'input_value', name: 'ASSET'},
                    {
                        type: 'field_dropdown',
                        name: 'KIND',
                        options: [
                            ['造型', 'costume'],
                            ['声音', 'sound']
                        ]
                    }
                ],
                category: ScratchBlocks.Categories.assets,
                colour: assetsColors.primary,
                colourSecondary: assetsColors.secondary,
                colourTertiary: assetsColors.tertiary,
                colourQuaternary: assetsColors.quaternary,
                extensions: ['shape_statement']
            });
        }
    };
    ScratchBlocks.Blocks.assets_unload = {
        init: function () {
            this.jsonInit({
                message0: '卸载素材 %1',
                args0: [{type: 'input_value', name: 'ASSET'}],
                category: ScratchBlocks.Categories.assets,
                colour: assetsColors.primary,
                colourSecondary: assetsColors.secondary,
                colourTertiary: assetsColors.tertiary,
                colourQuaternary: assetsColors.quaternary,
                extensions: ['shape_statement']
            });
        }
    };
    ScratchBlocks.Blocks.assets_unloadall = {
        init: function () {
            this.jsonInit({
                message0: '卸载所有素材',
                category: ScratchBlocks.Categories.assets,
                colour: assetsColors.primary,
                colourSecondary: assetsColors.secondary,
                colourTertiary: assetsColors.tertiary,
                colourQuaternary: assetsColors.quaternary,
                extensions: ['shape_statement']
            });
        }
    };
    ScratchBlocks.Blocks.assets_get = {
        init: function () {
            this.jsonInit({
                message0: '素材 %2 的 %1',
                args0: [
                    {
                        type: 'field_dropdown',
                        name: 'PROPERTY',
                        options: [
                            ['文本', 'text'],
                            ['数据URI', 'data uri'],
                            ['Base64', 'base64'],
                            ['链接', 'url'],
                            ['大小', 'size'],
                            ['格式', 'format'],
                            ['文件夹', 'folder']
                        ]
                    },
                    {type: 'input_value', name: 'ASSET'}
                ],
                category: ScratchBlocks.Categories.assets,
                colour: assetsColors.primary,
                colourSecondary: assetsColors.secondary,
                colourTertiary: assetsColors.tertiary,
                colourQuaternary: assetsColors.quaternary,
                extensions: ['output_string']
            });
        }
    };
    ScratchBlocks.Blocks.assets_byte = {
        init: function () {
            this.jsonInit({
                message0: '素材 %2 的第 %1 字节',
                args0: [
                    {type: 'input_value', name: 'INDEX'},
                    {type: 'input_value', name: 'ASSET'}
                ],
                category: ScratchBlocks.Categories.assets,
                colour: assetsColors.primary,
                colourSecondary: assetsColors.secondary,
                colourTertiary: assetsColors.tertiary,
                colourQuaternary: assetsColors.quaternary,
                extensions: ['output_number']
            });
        }
    };
    ScratchBlocks.Blocks.assets_check = {
        init: function () {
            this.jsonInit({
                message0: '素材 %1 %2?',
                args0: [
                    {type: 'input_value', name: 'ASSET'},
                    {
                        type: 'field_dropdown',
                        name: 'STATE',
                        options: [
                            ['存在', 'exists'],
                            ['已加载', 'is loaded']
                        ]
                    }
                ],
                category: ScratchBlocks.Categories.assets,
                colour: assetsColors.primary,
                colourSecondary: assetsColors.secondary,
                colourTertiary: assetsColors.tertiary,
                colourQuaternary: assetsColors.quaternary,
                extensions: ['output_boolean']
            });
        }
    };
    ScratchBlocks.Blocks.assets_set = {
        init: function () {
            this.jsonInit({
                message0: '将素材 %1 设为 %2 作为 %3',
                args0: [
                    {type: 'input_value', name: 'ASSET'},
                    {type: 'input_value', name: 'VALUE'},
                    {
                        type: 'field_dropdown',
                        name: 'FORMAT',
                        options: [
                            ['文本', 'text'],
                            ['Base64', 'base64'],
                            ['链接', 'url']
                        ]
                    }
                ],
                category: ScratchBlocks.Categories.assets,
                colour: assetsColors.primary,
                colourSecondary: assetsColors.secondary,
                colourTertiary: assetsColors.tertiary,
                colourQuaternary: assetsColors.quaternary,
                extensions: ['shape_statement']
            });
        }
    };
    ScratchBlocks.Blocks.assets_delete = {
        init: function () {
            this.jsonInit({
                message0: '删除素材 %1',
                args0: [{type: 'input_value', name: 'ASSET'}],
                category: ScratchBlocks.Categories.assets,
                colour: assetsColors.primary,
                colourSecondary: assetsColors.secondary,
                colourTertiary: assetsColors.tertiary,
                colourQuaternary: assetsColors.quaternary,
                extensions: ['shape_statement']
            });
        }
    };
    ScratchBlocks.Blocks.assets_allnames = {
        init: function () {
            this.jsonInit({
                message0: '所有素材名称',
                category: ScratchBlocks.Categories.assets,
                colour: assetsColors.primary,
                colourSecondary: assetsColors.secondary,
                colourTertiary: assetsColors.tertiary,
                colourQuaternary: assetsColors.quaternary,
                extensions: ['output_string']
            });
        }
    };
    ScratchBlocks.Blocks.assets_infolder = {
        init: function () {
            this.jsonInit({
                message0: '文件夹 %1 中的素材',
                args0: [{type: 'input_value', name: 'FOLDER'}],
                category: ScratchBlocks.Categories.assets,
                colour: assetsColors.primary,
                colourSecondary: assetsColors.secondary,
                colourTertiary: assetsColors.tertiary,
                colourQuaternary: assetsColors.quaternary,
                extensions: ['output_string']
            });
        }
    };

    // BilupBlocks: 字符串积木颜色与动态菜单（colours_strings 兜底）
    if (!ScratchBlocks.Colours.strings) {
        ScratchBlocks.Colours.strings = {
            primary: '#00A6A6',
            secondary: '#00A68A',
            tertiary: '#00817B',
            quaternary: '#00817B'
        };
    }
    if (!ScratchBlocks.Categories.strings) {
        ScratchBlocks.Categories.strings = 'strings';
    }
    const stringsColors = ScratchBlocks.Colours.strings;
    const operatorsColors = ScratchBlocks.Colours.operators;

    // BilupBlocks: 注册字符串积木（operator_letters_of / index_of / replace / repeat / change_case / trim / newline）
    ScratchBlocks.Blocks.operator_letters_of = {
        init: function () {
            this.jsonInit({
                message0: '%3 的第 %1 到 %2 个字符',
                args0: [
                    {type: 'input_value', name: 'LETTER1', check: 'Number'},
                    {type: 'input_value', name: 'LETTER2', check: 'Number'},
                    {type: 'input_value', name: 'STRING', check: 'String'}
                ],
                category: ScratchBlocks.Categories.strings,
                colour: stringsColors.primary,
                colourSecondary: stringsColors.secondary,
                colourTertiary: stringsColors.tertiary,
                colourQuaternary: stringsColors.quaternary,
                extensions: ['output_string']
            });
        }
    };
    ScratchBlocks.Blocks.operator_index_of = {
        init: function () {
            this.jsonInit({
                message0: '%1 在 %2 中的索引',
                args0: [
                    {type: 'input_value', name: 'SUBSTRING', check: 'String'},
                    {type: 'input_value', name: 'STRING', check: 'String'}
                ],
                category: ScratchBlocks.Categories.strings,
                colour: stringsColors.primary,
                colourSecondary: stringsColors.secondary,
                colourTertiary: stringsColors.tertiary,
                colourQuaternary: stringsColors.quaternary,
                extensions: ['output_number']
            });
        }
    };
    ScratchBlocks.Blocks.operator_replace = {
        init: function () {
            this.jsonInit({
                message0: '将 %2 中的 %1 替换为 %3',
                args0: [
                    {type: 'input_value', name: 'SUBSTRING', check: 'String'},
                    {type: 'input_value', name: 'STRING', check: 'String'},
                    {type: 'input_value', name: 'REPLACE', check: 'String'}
                ],
                category: ScratchBlocks.Categories.strings,
                colour: stringsColors.primary,
                colourSecondary: stringsColors.secondary,
                colourTertiary: stringsColors.tertiary,
                colourQuaternary: stringsColors.quaternary,
                extensions: ['output_string']
            });
        }
    };
    ScratchBlocks.Blocks.operator_repeat = {
        init: function () {
            this.jsonInit({
                message0: '重复 %1 %2 次',
                args0: [
                    {type: 'input_value', name: 'STRING', check: 'String'},
                    {type: 'input_value', name: 'REPEAT', check: 'Number'}
                ],
                category: ScratchBlocks.Categories.strings,
                colour: stringsColors.primary,
                colourSecondary: stringsColors.secondary,
                colourTertiary: stringsColors.tertiary,
                colourQuaternary: stringsColors.quaternary,
                extensions: ['output_string']
            });
        }
    };
    ScratchBlocks.Blocks.operator_change_case = {
        init: function () {
            this.jsonInit({
                message0: '将 %1 转换为 %2',
                args0: [
                    {type: 'input_value', name: 'STRING', check: 'String'},
                    {
                        type: 'field_dropdown',
                        name: 'CASE',
                        options: [
                            ['大写', 'uppercase'],
                            ['小写', 'lowercase']
                        ]
                    }
                ],
                category: ScratchBlocks.Categories.strings,
                colour: stringsColors.primary,
                colourSecondary: stringsColors.secondary,
                colourTertiary: stringsColors.tertiary,
                colourQuaternary: stringsColors.quaternary,
                extensions: ['output_string']
            });
        }
    };
    ScratchBlocks.Blocks.operator_trim = {
        init: function () {
            this.jsonInit({
                message0: '去除首尾空格 %1',
                args0: [{type: 'input_value', name: 'STRING', check: 'String'}],
                category: ScratchBlocks.Categories.strings,
                colour: stringsColors.primary,
                colourSecondary: stringsColors.secondary,
                colourTertiary: stringsColors.tertiary,
                colourQuaternary: stringsColors.quaternary,
                extensions: ['output_string']
            });
        }
    };
    ScratchBlocks.Blocks.operator_newline = {
        init: function () {
            this.jsonInit({
                message0: '换行',
                category: ScratchBlocks.Categories.strings,
                colour: stringsColors.primary,
                colourSecondary: stringsColors.secondary,
                colourTertiary: stringsColors.tertiary,
                colourQuaternary: stringsColors.quaternary,
                extensions: ['output_string']
            });
        }
    };

    // BilupBlocks: 注册数学扩展积木（operator_clamp / pi / min / max，SKY 构建产物无定义需动态注册）
    ScratchBlocks.Blocks.operator_clamp = {
        init: function () {
            this.jsonInit({
                message0: '将 %1 限制在 %2 到 %3 之间',
                args0: [
                    {type: 'input_value', name: 'NUM', check: 'Number'},
                    {type: 'input_value', name: 'MIN', check: 'Number'},
                    {type: 'input_value', name: 'MAX', check: 'Number'}
                ],
                category: ScratchBlocks.Categories.operators,
                colour: operatorsColors.primary,
                colourSecondary: operatorsColors.secondary,
                colourTertiary: operatorsColors.tertiary,
                colourQuaternary: operatorsColors.quaternary,
                extensions: ['output_number']
            });
        }
    };
    ScratchBlocks.Blocks.operator_pi = {
        init: function () {
            this.jsonInit({
                message0: 'π',
                category: ScratchBlocks.Categories.operators,
                colour: operatorsColors.primary,
                colourSecondary: operatorsColors.secondary,
                colourTertiary: operatorsColors.tertiary,
                colourQuaternary: operatorsColors.quaternary,
                extensions: ['output_number']
            });
        }
    };
    ScratchBlocks.Blocks.operator_min = {
        init: function () {
            this.jsonInit({
                message0: '最小值 %1 %2',
                args0: [
                    {type: 'input_value', name: 'NUM1', check: 'Number'},
                    {type: 'input_value', name: 'NUM2', check: 'Number'}
                ],
                category: ScratchBlocks.Categories.operators,
                colour: operatorsColors.primary,
                colourSecondary: operatorsColors.secondary,
                colourTertiary: operatorsColors.tertiary,
                colourQuaternary: operatorsColors.quaternary,
                extensions: ['output_number']
            });
        }
    };
    ScratchBlocks.Blocks.operator_max = {
        init: function () {
            this.jsonInit({
                message0: '最大值 %1 %2',
                args0: [
                    {type: 'input_value', name: 'NUM1', check: 'Number'},
                    {type: 'input_value', name: 'NUM2', check: 'Number'}
                ],
                category: ScratchBlocks.Categories.operators,
                colour: operatorsColors.primary,
                colourSecondary: operatorsColors.secondary,
                colourTertiary: operatorsColors.tertiary,
                colourQuaternary: operatorsColors.quaternary,
                extensions: ['output_number']
            });
        }
    };

    ScratchBlocks.Blocks.looks_costume.init = function () {
        const json = jsonForMenuBlock('COSTUME', costumesMenu, looksColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.looks_backdrops.init = function () {
        const json = jsonForMenuBlock('BACKDROP', backdropsMenu, looksColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.event_whenbackdropswitchesto.init = function () {
        const json = jsonForHatBlockMenu(
            ScratchBlocks.Msg.EVENT_WHENBACKDROPSWITCHESTO,
            'BACKDROP', backdropNamesMenu, eventColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.motion_pointtowards_menu.init = function () {
        const random = ScratchBlocks.ScratchMsgs.translate('MOTION_POINTTOWARDS_RANDOM', 'random direction');
        const mouse = ScratchBlocks.ScratchMsgs.translate('MOTION_POINTTOWARDS_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TOWARDS', spriteMenu, motionColors, [
            [mouse, '_mouse_'],
            [random, '_random_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.motion_goto_menu.init = function () {
        const random = ScratchBlocks.ScratchMsgs.translate('MOTION_GOTO_RANDOM', 'random position');
        const mouse = ScratchBlocks.ScratchMsgs.translate('MOTION_GOTO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TO', spriteMenu, motionColors, [
            [random, '_random_'],
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.motion_glideto_menu.init = function () {
        const random = ScratchBlocks.ScratchMsgs.translate('MOTION_GLIDETO_RANDOM', 'random position');
        const mouse = ScratchBlocks.ScratchMsgs.translate('MOTION_GLIDETO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TO', spriteMenu, motionColors, [
            [random, '_random_'],
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_of_object_menu.init = function () {
        const stage = ScratchBlocks.ScratchMsgs.translate('SENSING_OF_STAGE', 'Stage');
        const json = jsonForMenuBlock('OBJECT', spriteMenu, sensingColors, [
            [stage, '_stage_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_of.init = function () {
        const blockId = this.id;
        const blockType = this.type;

        // Get the sensing_of block from vm.
        let defaultSensingOfBlock;
        const blocks = vm.runtime.flyoutBlocks._blocks;
        Object.keys(blocks).forEach(id => {
            const block = blocks[id];
            if (id === blockType || (block && block.opcode === blockType)) {
                defaultSensingOfBlock = block;
            }
        });

        // Function that fills in menu for the first input in the sensing block.
        // Called every time it opens since it depends on the values in the other block input.
        const menuFn = function () {
            const stageOptions = [
                [ScratchBlocks.Msg.SENSING_OF_BACKDROPNUMBER, 'backdrop #'],
                [ScratchBlocks.Msg.SENSING_OF_BACKDROPNAME, 'backdrop name'],
                [ScratchBlocks.Msg.SENSING_OF_VOLUME, 'volume']
            ];
            const spriteOptions = [
                [ScratchBlocks.Msg.SENSING_OF_XPOSITION, 'x position'],
                [ScratchBlocks.Msg.SENSING_OF_YPOSITION, 'y position'],
                [ScratchBlocks.Msg.SENSING_OF_DIRECTION, 'direction'],
                [ScratchBlocks.Msg.SENSING_OF_COSTUMENUMBER, 'costume #'],
                [ScratchBlocks.Msg.SENSING_OF_COSTUMENAME, 'costume name'],
                [ScratchBlocks.Msg.SENSING_OF_SIZE, 'size'],
                [ScratchBlocks.Msg.SENSING_OF_VOLUME, 'volume']
            ];
            if (vm.editingTarget) {
                let lookupBlocks = vm.editingTarget.blocks;
                let sensingOfBlock = lookupBlocks.getBlock(blockId);

                // The block doesn't exist, but should be in the flyout. Look there.
                if (!sensingOfBlock) {
                    sensingOfBlock = vm.runtime.flyoutBlocks.getBlock(blockId) || defaultSensingOfBlock;
                    // If we still don't have a block, just return an empty list . This happens during
                    // scratch blocks construction.
                    if (!sensingOfBlock) {
                        return [['', '']];
                    }
                    // The block was in the flyout so look up future block info there.
                    lookupBlocks = vm.runtime.flyoutBlocks;
                }
                const sort = function (options) {
                    options.sort(ScratchBlocks.scratchBlocksUtils.compareStrings);
                };
                // Get all the stage variables (no lists) so we can add them to menu when the stage is selected.
                const stageVariableOptions = vm.runtime.getTargetForStage().getAllVariableNamesInScopeByType('');
                sort(stageVariableOptions);
                const stageVariableMenuItems = stageVariableOptions.map(variable => [variable, variable]);
                if (sensingOfBlock.inputs.OBJECT.shadow !== sensingOfBlock.inputs.OBJECT.block) {
                    // There's a block dropped on top of the menu. It'd be nice to evaluate it and
                    // return the correct list, but that is tricky. Scratch2 just returns stage options
                    // so just do that here too.
                    return stageOptions.concat(stageVariableMenuItems);
                }
                const menuBlock = lookupBlocks.getBlock(sensingOfBlock.inputs.OBJECT.shadow);
                const selectedItem = menuBlock.fields.OBJECT.value;
                if (selectedItem === '_stage_') {
                    return stageOptions.concat(stageVariableMenuItems);
                }
                // Get all the local variables (no lists) and add them to the menu.
                const target = vm.runtime.getSpriteTargetByName(selectedItem);
                let spriteVariableOptions = [];
                // The target should exist, but there are ways for it not to (e.g. #4203).
                if (target) {
                    spriteVariableOptions = target.getAllVariableNamesInScopeByType('', true);
                    sort(spriteVariableOptions);
                }
                const spriteVariableMenuItems = spriteVariableOptions.map(variable => [variable, variable]);
                return spriteOptions.concat(spriteVariableMenuItems);
            }
            return [['', '']];
        };

        const json = jsonForSensingMenus(menuFn);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_distancetomenu.init = function () {
        const mouse = ScratchBlocks.ScratchMsgs.translate('SENSING_DISTANCETO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('DISTANCETOMENU', spriteMenu, sensingColors, [
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_touchingobjectmenu.init = function () {
        const mouse = ScratchBlocks.ScratchMsgs.translate('SENSING_TOUCHINGOBJECT_POINTER', 'mouse-pointer');
        const edge = ScratchBlocks.ScratchMsgs.translate('SENSING_TOUCHINGOBJECT_EDGE', 'edge');
        const json = jsonForMenuBlock('TOUCHINGOBJECTMENU', spriteMenu, sensingColors, [
            [mouse, '_mouse_'],
            [edge, '_edge_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.control_create_clone_of_menu.init = function () {
        const json = jsonForMenuBlock('CLONE_OPTION', cloneMenu, controlColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.VerticalFlyout.getCheckboxState = function (blockId) {
        const monitoredBlock = vm.runtime.monitorBlocks._blocks[blockId];
        return monitoredBlock ? monitoredBlock.isMonitored : false;
    };

    ScratchBlocks.FlyoutExtensionCategoryHeader.getExtensionState = function (extensionId) {
        if (vm.getPeripheralIsConnected(extensionId)) {
            return ScratchBlocks.StatusButtonState.READY;
        }
        return ScratchBlocks.StatusButtonState.NOT_READY;
    };

    ScratchBlocks.FieldNote.playNote_ = function (noteNum, extensionId) {
        vm.runtime.emit('PLAY_NOTE', noteNum, extensionId);
    };

    // Use a collator's compare instead of localeCompare which internally
    // creates a collator. Using this is a lot faster in browsers that create a
    // collator for every localeCompare call.
    const collator = new Intl.Collator([], {
        sensitivity: 'base',
        numeric: true
    });
    ScratchBlocks.scratchBlocksUtils.compareStrings = function (str1, str2) {
        return collator.compare(str1, str2);
    };

    // Blocks wants to know if 3D CSS transforms are supported. The cross
    // section of browsers Scratch supports and browsers that support 3D CSS
    // transforms will make the return always true.
    //
    // Shortcutting to true lets us skip an expensive style recalculation when
    // first loading the Scratch editor.
    ScratchBlocks.utils.is3dSupported = function () {
        return true;
    };

    return ScratchBlocks;
}
