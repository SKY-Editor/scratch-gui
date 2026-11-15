// SKYEditor：项目资源虚拟文件系统（测试版）—— 悬浮测试入口
// 职责：在舞台中央渲染一个悬浮按钮，点击弹出文件树窗口。
// 说明：仅用于本轮效果核对；后续如需正式入口，可直接复用 ProjectFsWindow。
import PropTypes from 'prop-types';
import React, {useCallback, useState} from 'react';
import {connect} from 'react-redux';

import ProjectFsWindow from './project-fs-window.jsx';
import styles from './project-fs.css';

const ProjectFsTestButton = ({vm, projectTitle}) => {
    const [open, setOpen] = useState(false);

    const handleOpen = useCallback(() => setOpen(true), []);
    const handleClose = useCallback(() => setOpen(false), []);

    return (
        <React.Fragment>
            <button
                className={styles.testButton}
                onClick={handleOpen}
                title="项目资源（文件系统 · 测试）"
                type="button"
            >
                <span className={styles.testButtonIcon} />
                {'项目资源 · 测试'}
            </button>
            {open ? (
                <ProjectFsWindow
                    vm={vm}
                    projectTitle={projectTitle}
                    onClose={handleClose}
                />
            ) : null}
        </React.Fragment>
    );
};

ProjectFsTestButton.propTypes = {
    vm: PropTypes.shape({
        runtime: PropTypes.shape({
            targets: PropTypes.array
        })
    }),
    projectTitle: PropTypes.string
};

ProjectFsTestButton.defaultProps = {
    vm: null,
    projectTitle: ''
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle
});

export default connect(mapStateToProps)(ProjectFsTestButton);
