import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import ThemedWindow from '../../../../components/tw-themed-window/themed-window.jsx';
import addonsIcon from '../../../../components/menu-bar/addons.svg';
import AddonSettingsComponent from '../../../../addons/settings/settings.jsx';
import downloadBlob from '../../../../lib/download-blob.js';

const messages = defineMessages({
    title: {
        defaultMessage: 'Addons',
        description: 'Title of the addon settings window',
        id: 'tw.menuBar.addons'
    }
});

const onExportSettings = settings => {
    const blob = new Blob([JSON.stringify(settings)]);
    downloadBlob('turbowarp-addon-settings.json', blob);
};

const AddonsContent = () => (
    <div
        style={{
            height: '100%',
            overflow: 'hidden',
            position: 'relative'
        }}
    >
        <AddonSettingsComponent
            onExportSettings={onExportSettings}
            onReload={() => location.reload()}
        />
    </div>
);

const AddonsWindow = ({intl, onClose}) => (
    <ThemedWindow
        id="addonsWindow"
        title={intl.formatMessage(messages.title)}
        onClose={onClose}
        icon={addonsIcon}
        width={960}
        height={640}
        flushBody
    >
        <AddonsContent />
    </ThemedWindow>
);

AddonsWindow.propTypes = {
    intl: intlShape.isRequired,
    onClose: PropTypes.func.isRequired
};

export default injectIntl(AddonsWindow);
