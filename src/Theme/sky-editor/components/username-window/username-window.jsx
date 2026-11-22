import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import ThemedWindow from '../../../../components/tw-themed-window/themed-window.jsx';
import {UsernameModalBody} from '../../../../components/tw-username-modal/username-modal.jsx';

import styles from '../../../../components/tw-username-modal/username-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Change Username',
        description: 'Title change username modal',
        id: 'tw.usernameModal.title'
    }
});

const UsernameWindow = ({intl, onCancel, ...bodyProps}) => (
    <ThemedWindow
        id="usernameWindow"
        title={intl.formatMessage(messages.title)}
        onClose={onCancel}
        width={440}
        height={400}
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
            <UsernameModalBody {...bodyProps} />
        </div>
    </ThemedWindow>
);

UsernameWindow.propTypes = {
    intl: intlShape.isRequired,
    mustChangeUsername: PropTypes.bool.isRequired,
    value: PropTypes.string.isRequired,
    valueValid: PropTypes.bool.isRequired,
    onCancel: PropTypes.func.isRequired,
    onChange: PropTypes.func.isRequired,
    onFocus: PropTypes.func.isRequired,
    onKeyPress: PropTypes.func.isRequired,
    onOk: PropTypes.func.isRequired,
    onReset: PropTypes.func.isRequired
};

export default injectIntl(UsernameWindow);
