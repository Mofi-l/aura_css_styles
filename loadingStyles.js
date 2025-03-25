export function injectLoadingStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        #aws-loading-indicator {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(35, 47, 62, 0.9);
            padding: 15px 20px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            animation: fadeIn 0.3s ease-in-out;
        }

        .loading-spinner {
            width: 20px;
            height: 20px;
            border: 3px solid #ffffff;
            border-top: 3px solid transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        .loading-text {
            color: white;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(10px); }
        }

        #aws-loading-indicator.hiding {
            animation: fadeOut 0.3s ease-in-out forwards;
        }
    `;
    document.head.appendChild(styleSheet);
}