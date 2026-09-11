import twTranslations from './generated-translations.json';
import skyEditorTranslations from './sky-editor-translations.json';
import skyEditorPaintTranslations from './sky-editor-paint-translations.json';
import skyEditorMusicPlayerTranslations from './sky-editor-music-player-translations.json';

const addAdditionalTranslations = editorMessages => {
    for (const locale of Object.keys(editorMessages)) {
        const toMixIn = twTranslations[locale.toLowerCase()];
        if (toMixIn) {
            Object.assign(editorMessages[locale], toMixIn);
        }

        // SKY Editor custom translations; fall back to English for locales
        // that are not explicitly covered in sky-editor-translations.json.
        const skyMixIn = skyEditorTranslations[locale.toLowerCase()] || skyEditorTranslations.en;
        if (skyMixIn) {
            Object.assign(editorMessages[locale], skyMixIn);
        }

        // SKY Editor scratch-paint translations; covers all supported locales.
        const paintMixIn = skyEditorPaintTranslations[locale.toLowerCase()] || skyEditorPaintTranslations.en;
        if (paintMixIn) {
            Object.assign(editorMessages[locale], paintMixIn);
        }

        // SKY Editor music-player translations; fall back to English.
        const musicPlayerMixIn =
            skyEditorMusicPlayerTranslations[locale.toLowerCase()] || skyEditorMusicPlayerTranslations.en;
        if (musicPlayerMixIn) {
            Object.assign(editorMessages[locale], musicPlayerMixIn);
        }
    }

    // We reuse our `es` translations for `es-419` instead of maintaining separate translations.
    Object.assign(editorMessages['es-419'], twTranslations.es);
    Object.assign(editorMessages['es-419'], skyEditorTranslations.en);
    Object.assign(editorMessages['es-419'], skyEditorPaintTranslations.es);
    Object.assign(editorMessages['es-419'], skyEditorMusicPlayerTranslations.en);
    Object.assign(editorMessages['es-419'], skyEditorMusicPlayerTranslations.es || {});
};

export default addAdditionalTranslations;
