import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import TWRenderRecoloredImage from '../../lib/tw-recolor/render.jsx';
import filterIcon from '!../../lib/tw-recolor/build!./icon--filter.svg';
import xIcon from '!../../lib/tw-recolor/build!./icon--x.svg';
import styles from './filter.css';

const FilterComponent = props => {
    const {
        className,
        onChange,
        onClear,
        placeholderText,
        filterQuery,
        inputClassName,
        iconClassName,
        xIconWrapperClassName
    } = props;
    return (
        <div
            className={classNames(className, styles.filter, {
                [styles.isActive]: filterQuery.length > 0
            })}
        >
            <TWRenderRecoloredImage
                className={classNames(styles.filterIcon, iconClassName)}
                src={filterIcon}
            />
            <input
                className={classNames(styles.filterInput, inputClassName)}
                placeholder={placeholderText}
                type="text"
                value={filterQuery}
                onChange={onChange}
            />
            <div
                className={classNames(styles.xIconWrapper, xIconWrapperClassName)}
                onClick={onClear}
            >
                <TWRenderRecoloredImage
                    className={styles.xIcon}
                    src={xIcon}
                />
            </div>
        </div>
    );
};

FilterComponent.propTypes = {
    className: PropTypes.string,
    filterQuery: PropTypes.string,
    iconClassName: PropTypes.string,
    inputClassName: PropTypes.string,
    onChange: PropTypes.func,
    onClear: PropTypes.func,
    placeholderText: PropTypes.string,
    xIconWrapperClassName: PropTypes.string
};
FilterComponent.defaultProps = {
    placeholderText: 'Search'
};
export default FilterComponent;
