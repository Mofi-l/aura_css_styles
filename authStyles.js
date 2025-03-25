// authStyles.js
export function injectAuthStyles() {
    const authStyles = document.createElement('style');
    authStyles.textContent = `
    .auth-modal {
        position: fixed;
        inset: 0;
        background-color: rgba(17, 17, 17, 0.9);
        display: grid;
        place-items: center;
        z-index: 1000;
        backdrop-filter: blur(8px);
    }

    .auth-modal-content {
        background: #1a1f2e;
        padding: 2.5rem;
        border-radius: 16px;
        width: min(90%, 400px);
        text-align: center;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3);
        animation: modalAppear 0.4s ease-out;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .auth-modal-title {
        color: #fff;
        font-size: 1.75rem;
        font-weight: 800;
        margin-bottom: 2rem;
        position: relative;
    }

    .auth-input-container {
        margin-bottom: 1.25rem;
        position: relative;
    }

    .auth-input {
        width: 100%;
        padding: 1rem 1.25rem;
        background: rgba(255, 255, 255, 0.05);
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        color: #fff;
        font-size: 1rem;
        transition: all 0.2s ease;
    }

    .auth-input:focus {
        outline: none;
        border-color: #6366f1;
        background: rgba(255, 255, 255, 0.1);
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
    }

    .auth-input::placeholder {
        color: rgba(255, 255, 255, 0.5);
    }

    .auth-button-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-top: 2rem;
    }

    .auth-submit-btn,
    .auth-cancel-btn {
        padding: 0.875rem 1.5rem;
        border: none;
        border-radius: 10px;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
 ;
        transition: all 0.2s ease;
    }

    .auth-submit-btn {
        background: #6366f1;
        color: white;
    }

    .auth-submit-btn:hover {
        background: #4f46e5;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
    }

    .auth-cancel-btn {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    .auth-cancel-btn:hover {
        background: rgba(255, 255, 255, 0.15);
    }

.toggle-password-btn {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.eye-icon {
    width: 24px;
    height: 24px;
    fill: rgba(255, 255, 255, 0.5);
    transition: fill 0.2s ease;
}

.toggle-password-btn:hover .eye-icon {
    fill: rgba(255, 255, 255, 0.8);
}


    @keyframes modalAppear {
        from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
        }
        to {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }
    `;
    document.head.appendChild(authStyles);
}
