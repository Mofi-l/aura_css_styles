// alertStyles.js
export function injectAlertStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        .custom-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(8px);
            animation: overlayFadeIn 0.3s ease-out;
        }

        .custom-alert-box {
            background: linear-gradient(145deg, #2a2a2a, #323232);
            border-radius: 16px;
            padding: 25px 35px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3),
                        0 1px 8px rgba(0, 0, 0, 0.2),
                        0 0 0 1px rgba(255, 255, 255, 0.1) inset;
            text-align: center;
            max-width: 400px;
            width: 90%;
            animation: modalSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .custom-message {
            margin-bottom: 25px;
            font-size: 1.1rem;
            line-height: 1.5;
            color: #ffffff;
            font-weight: 500;
        }

        .custom-button {
            padding: 10px 28px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.95rem;
            font-weight: 600;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            margin: 0 8px;
            position: relative;
            overflow: hidden;
        }

        .custom-button::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        .custom-button:hover::after {
            opacity: 1;
        }

        .custom-button.primary {
            background: linear-gradient(135deg, #4CAF50, #43A047);
            box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
            color: white;
        }

        .custom-button.primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
        }

        .custom-button.primary:active {
            transform: translateY(1px);
            box-shadow: 0 2px 10px rgba(76, 175, 80, 0.3);
        }

        .custom-button.danger {
            background: linear-gradient(135deg, #FF5252, #D32F2F);
            box-shadow: 0 4px 15px rgba(255, 82, 82, 0.3);
            color: white;
        }

        .custom-button.danger:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 82, 82, 0.4);
        }

        .custom-button.danger:active {
            transform: translateY(1px);
            box-shadow: 0 2px 10px rgba(255, 82, 82, 0.3);
        }

        @keyframes overlayFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: scale(0.95) translateY(10px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        @media (max-width: 480px) {
            .custom-alert-box {
                width: 85%;
                padding: 20px 25px;
                margin: 20px;
            }

            .custom-button {
                padding: 10px 20px;
                min-width: 80px;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            .custom-overlay,
            .custom-alert-box,
            .custom-button {
                animation: none;
                transition: opacity 0.1s ease-in-out;
            }
        }
    `;
    document.head.appendChild(styleSheet);
}
