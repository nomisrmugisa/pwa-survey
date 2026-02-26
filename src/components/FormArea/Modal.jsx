import React from 'react';
import './FormArea.css';

const Modal = ({ isOpen, onClose, title, children }) => {
    console.log(`Modal rendering: isOpen=${isOpen}, title=${title}`);
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-content">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
