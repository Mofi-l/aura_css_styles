export function injectDisplayAuxStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        /* Main Container */
        #auxTablePopup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #ffffff;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            max-width: 92%;
            max-height: 85vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            transition: all 0.3s ease;
        }

        /* Table Container */
        .table-container {
            overflow-x: auto;
            overflow-y: auto;
            margin-top: 16px;
            border-radius: 12px;
            background: #ffffff;
            box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.05);
            padding: 4px;
        }

        /* Scrollbar Styling */
        .table-container::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        .table-container::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
        }

        .table-container::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 4px;
            transition: background 0.3s ease;
        }

        .table-container::-webkit-scrollbar-thumb:hover {
            background: #666;
        }

        /* Table Styling */
        .aux-data-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            background-color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        /* Header Styling */
        .table-header {
            position: sticky;
            top: 0;
            background-color: #f8f9fa;
            color: #2c3e50;
            font-weight: 600;
            padding: 16px;
            text-align: left;
            font-size: 0.9rem;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            border-bottom: 2px solid #e9ecef;
            transition: background-color 0.3s ease;
            z-index: 1;
        }

        .table-header:hover {
            background-color: #e9ecef;
        }

        /* Cell Styling */
        .table-cell {
            padding: 12px 16px;
            border-bottom: 1px solid #e9ecef;
            font-size: 0.95rem;
            color: #495057;
            transition: background-color 0.2s ease;
        }

        /* Row Hover Effect */
        .table-row:hover {
            background-color: #f8f9fa;
        }

        /* Input Styling */
        .editable-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid transparent;
            border-radius: 6px;
            font-size: 0.95rem;
            color: #495057;
            background-color: transparent;
            transition: all 0.3s ease;
        }

        .editable-input:focus {
            outline: none;
            border-color: #4dabf7;
            box-shadow: 0 0 0 3px rgba(77, 171, 247, 0.2);
        }

        .editable-input.editing {
            background-color: #fff;
            border-color: #ced4da;
        }

        /* Control Panel Styling */
        .control-panel {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            margin-bottom: 16px;
            border-bottom: 2px solid #e9ecef;
        }

        /* Button Styling */
        .edit-button, .save-button {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .edit-button {
            background-color: #228be6;
            color: white;
        }

        .edit-button:hover {
            background-color: #1c7ed6;
            transform: translateY(-1px);
        }

        .edit-button.editing {
            background-color: #e03131;
        }

        .edit-button.editing:hover {
            background-color: #c92a2a;
        }

        .save-button {
            background-color: #40c057;
            color: white;
            display: none;
        }

        .save-button:hover {
            background-color: #37b24d;
            transform: translateY(-1px);
        }

        /* Close Button Styling */
        .close-button {
            position: absolute;
            right: 16px;
            top: 16px;
            width: 32px;
            height: 32px;
            border: none;
            background: #f8f9fa;
            border-radius: 50%;
            font-size: 20px;
            color: #495057;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }

        .close-button:hover {
            background: #e9ecef;
            color: #212529;
            transform: rotate(90deg);
        }

        /* Modified Indicator Styling */
        .modified-indicator {
            color: #f59f00;
            padding: 12px;
            margin-bottom: 16px;
            background-color: #fff9db;
            border-radius: 8px;
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .modified-indicator::before {
            content: "⚠️";
            font-size: 1.1rem;
        }

        /* No Data Message Styling */
        .no-data-message {
            text-align: center;
            padding: 32px;
            color: #868e96;
            font-size: 1.1rem;
            background: #f8f9fa;
            border-radius: 12px;
            margin: 16px 0;
        }

        /* Loading State */
        .loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2;
        }

        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #228be6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            #auxTablePopup {
                max-width: 95%;
                padding: 16px;
            }

            .table-header {
                padding: 12px;
                font-size: 0.85rem;
            }

            .table-cell {
                padding: 10px;
                font-size: 0.9rem;
            }

            .editable-input {
                padding: 6px 8px;
                font-size: 0.9rem;
            }

            .edit-button, .save-button {
                padding: 8px 16px;
                font-size: 0.9rem;
            }
        }

        /* Animation Effects */
        @keyframes fadeIn {
            from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        #auxTablePopup {
            animation: fadeIn 0.3s ease-out;
        }

        /* Tooltip Styling */
        [data-tooltip] {
            position: relative;
            cursor: help;
        }

        [data-tooltip]:before {
            content: attr(data-tooltip);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 12px;
            background: #495057;
            color: white;
            font-size: 0.85rem;
            border-radius: 4px;
            white-space: nowrap;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
        }

        [data-tooltip]:hover:before {
            opacity: 1;
            visibility: visible;
            transform: translateX(-50%) translateY(-8px);
        }

        /* Empty State Styling */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 48px 24px;
            text-align: center;
        }

        .empty-state-icon {
            font-size: 48px;
            color: #dee2e6;
            margin-bottom: 16px;
        }

        .empty-state-text {
            color: #868e96;
            font-size: 1.1rem;
            max-width: 300px;
            line-height: 1.5;
        }
    `;
    document.head.appendChild(styleSheet);
}