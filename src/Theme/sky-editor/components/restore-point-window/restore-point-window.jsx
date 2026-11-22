import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import ThemedWindow from '../../../../components/tw-themed-window/themed-window.jsx';
import {RestorePointModalBody} from '../../../../components/tw-restore-point-modal/restore-point-modal.jsx';

import styles from '../../../../components/tw-restore-point-modal/restore-point-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Restore Points',
        description: 'Title of restore point management modal',
        id: 'tw.restorePoints.title'
    }
});

const RestorePointWindow = ({intl, onClose, ...bodyProps}) => (
    <ThemedWindow
        id="restorePointWindow"
        title={intl.formatMessage(messages.title)}
        onClose={onClose}
        width={640}
        height={480}
        flushBody
    >
        <div
            className={styles.body}
            style={{
                height: '100%',
                overflow: 'auto',
                boxSizing: 'border-box'
            }}
        >
            <RestorePointModalBody {...bodyProps} intl={intl} />
        </div>
    </ThemedWindow>
);

RestorePointWindow.propTypes = {
    intl: intlShape,
    interval: PropTypes.number.isRequired,
    onChangeInterval: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onClickDelete: PropTypes.func.isRequired,
    onClickDeleteAll: PropTypes.func.isRequired,
    onClickExport: PropTypes.func.isRequired,
    onClickLoad: PropTypes.func.isRequired,
    isExporting: PropTypes.func.isRequired,
    isLoading: PropTypes.bool.isRequired,
    totalSize: PropTypes.number.isRequired,
    restorePoints: PropTypes.arrayOf(PropTypes.shape({})),
    error: PropTypes.string
};

export default injectIntl(RestorePointWindow);
