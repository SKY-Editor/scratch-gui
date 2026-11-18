import {detectAudioEditorStyle} from '../lib/sky-settings-store';

const SET_AUDIO_EDITOR_STYLE = 'scratch-gui/audio-editor-style/SET_AUDIO_EDITOR_STYLE';

const initialState = detectAudioEditorStyle();

const reducer = (state = initialState, action) => {
    switch (action.type) {
    case SET_AUDIO_EDITOR_STYLE:
        return action.style;
    default:
        return state;
    }
};

const setAudioEditorStyle = style => ({
    type: SET_AUDIO_EDITOR_STYLE,
    style
});

export {
    reducer as default,
    initialState as audioEditorStyleInitialState,
    setAudioEditorStyle
};
