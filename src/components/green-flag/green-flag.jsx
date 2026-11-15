import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import greenFlagIcon from './icon--green-flag.svg';
import styles from './green-flag.css';

const GreenFlagComponent = function (props) {
    const { active, className, onClick, title, ...componentProps } = props;
    return (
        <div
            className={classNames(className, styles.greenFlag, { [styles.isActive]: active })}
            role="button"
            tabIndex={0}
            draggable={false}
            title={title}
            onClick={onClick}
            onContextMenu={onClick}
            {...componentProps}
        >
            <img
                className={styles.greenFlagIcon}
                draggable={false}
                src={greenFlagIcon}
                alt=""
            />
        </div>
    );
};
GreenFlagComponent.propTypes = { active: PropTypes.bool, className: PropTypes.string, onClick: PropTypes.func.isRequired, title: PropTypes.string };
GreenFlagComponent.defaultProps = { active: false, title: 'Go' };
export default GreenFlagComponent;
