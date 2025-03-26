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
            width: 90%; /* Changed from max-width to width */
            height: 80vh; /* Fixed height */
            display: flex;
            flex-direction: column;
            transition: all 0.3s ease;
        }

        /* Close Button Styling - Moved to top right corner */
        .close-button {
            position: absolute;
            right: 20px;
            top: 20px;
            width: 32px;
            height: 32px;
            border: none;
            background: transparent; /* Changed to transparent */
            border-radius: 50%;
            font-size: 20px;
            color: #495057;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            z-index: 2; /* Ensure it's above other elements */
        }

        .close-button:hover {
            background: #e9ecef;
            color: #212529;
            transform: rotate(90deg);
        }

        /* Control Panel Styling */
        .control-panel {
            display: flex;
            justify-content: flex-start; /* Changed to flex-start */
            align-items: center;
            padding: 8px 0;
            margin-bottom: 16px;
            border-bottom: 2px solid #e9ecef;
            min-height: 50px; /* Added fixed height */
        }

        /* Table Container - Adjusted for proper scrolling */
        .table-container {
            flex: 1; /* Take remaining space */
            overflow: auto;
            margin-top: 16px;
            border-radius: 12px;
            background: #ffffff;
            position: relative;
            height: calc(100% - 100px); /* Subtract header height */
        }

        /* Table Styling */
        .aux-data-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            background-color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            table-layout: fixed; /* Added for fixed column widths */
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
            white-space: nowrap; /* Prevent header text wrapping */
        }

        /* Column Widths */
        .table-header,
        .table-cell {
            padding: 12px 16px;
        }

        .table-cell:nth-child(1) { width: 100px; } /* Date */
        .table-cell:nth-child(2) { width: 100px; } /* Username */
        .table-cell:nth-child(3) { width: 150px; } /* AUX Label */
        .table-cell:nth-child(4) { width: 100px; } /* Time Spent */
        .table-cell:nth-child(5) { width: 200px; } /* Project Title */
        .table-cell:nth-child(6) { width: 120px; } /* Related Audits */
        .table-cell:nth-child(7) { width: 100px; } /* Are You PL */
        .table-cell:nth-child(8) { width: 200px; } /* Comment */

        /* Cell Styling */
        .table-cell {
            border-bottom: 1px solid #e9ecef;
            font-size: 0.95rem;
            color: #495057;
            transition: background-color 0.2s ease;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
            background-color: #fff;
        }

        .editable-input.editing {
            background-color: #fff;
            border-color: #ced4da;
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
            margin-right: 10px;
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

        /* Responsive Design */
        @media (max-width: 1200px) {
            #auxTablePopup {
                width: 95%;
                height: 85vh;
            }

            .table-cell:nth-child(n) {
                width: auto;
                min-width: 100px;
            }
        }

        @media (max-width: 768px) {
            #auxTablePopup {
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
    `;
    document.head.appendChild(styleSheet);
}
