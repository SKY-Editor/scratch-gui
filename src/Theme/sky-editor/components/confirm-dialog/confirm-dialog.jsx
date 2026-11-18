import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';
import ThemedWindow from '../../../../components/tw-themed-window/themed-window.jsx';
import ThemedButton from '../../../../components/tw-themed-button/themed-button.jsx';
import Box from '../../../../components/box/box.jsx';
import styles from './confirm-dialog.css';

const ConfirmDialog = props => (
    <ThemedWindow
        title={props.title}
        icon={props.icon}
        width={480}
        height={220}
        disableMaximize
        disableResize
        className={styles.modalContent}
        id="confirmDialog"
        onClose={props.onCancel}
    >
        <Box className={styles.body}>
            <div className={styles.message}>{props.message}</div>
            <Box className={styles.buttonRow}>
                <ThemedButton
                    variant="secondary"
                    onClick={props.onCancel}
                >
                    <FormattedMessage
                        defaultMessage="取消"
                        description="Cancel button of the confirm dialog"
                        id="gui.confirmDialog.cancel"
                    />
                </ThemedButton>
                <ThemedButton
                    variant="danger"
                    onClick={props.onConfirm}
                >
                    <FormattedMessage
                        defaultMessage="确认删除"
                        description="Confirm delete button of the confirm dialog"
                        id="gui.confirmDialog.confirm"
                    />
                </ThemedButton>
            </Box>
        </Box>
    </ThemedWindow>
);

ConfirmDialog.propTypes = {
    message: PropTypes.string.isRequired,
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    icon: PropTypes.string
};

export default ConfirmDialog;
