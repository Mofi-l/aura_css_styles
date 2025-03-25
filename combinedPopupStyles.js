// combinedPopupStyles.js
export function injectCombinedPopupStyles() {
    const styles = document.createElement('style');
    styles.textContent = `
        #combined-popup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            z-index: 10000;
            background: url(https://raw.githubusercontent.com/Mofi-l/static-images/main/Background.jpg) no-repeat center center / cover;
            padding: 35px;
            border-radius: 24px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.1);
            max-width: 650px;
            width: 90%;
            color: white;
            font-family: 'Segoe UI', Arial, sans-serif;
            animation: popupIn 0.4s cubic-bezier(0.26, 1.04, 0.54, 1) forwards;
        }

        #combined-popup h2 {
            margin-bottom: 25px;
            font-size: 32px;
            text-align: center;
            font-weight: 600;
            color: white;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .input-container {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-bottom: 25px;
        }

        .input-field {
            flex: 1;
            min-width: 250px;
        }

        .input-field label {
            display: block;
            margin-bottom: 8px;
            font-size: 16px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.9);
        }

        .input-field input,
        .input-field textarea {
            width: 100%;
            padding: 12px 16px;
            font-size: 15px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            transition: all 0.3s ease;
            backdrop-filter: blur(4px);
        }

        .input-field input:focus,
        .input-field textarea:focus {
            outline: none;
            border-color: rgba(108, 92, 231, 0.6);
            background: rgba(255, 255, 255, 0.15);
            box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.2);
        }

        .input-field input::placeholder,
        .input-field textarea::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }

        .radio-group {
            margin: 20px 0;
        }

        .radio-label {
            display: block;
            margin-bottom: 10px;
            font-size: 16px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.9);
        }

        .radio-options {
            display: flex;
            gap: 20px;
        }

        .radio-option {
            display: inline-flex;
            align-items: center;
            cursor: pointer;
        }

        .radio-option input[type="radio"] {
            appearance: none;
            width: 20px;
            height: 20px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            margin-right: 8px;
            position: relative;
            cursor: pointer;
        }

        .radio-option input[type="radio"]:checked {
            border-color: #6c5ce7;
            background: #6c5ce7;
        }

        .radio-option input[type="radio"]:checked::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 8px;
            height: 8px;
            background: white;
            border-radius: 50%;
        }

        .button-group {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-top: 30px;
        }

        .popup-button {
            padding: 12px 28px;
            font-size: 16px;
            font-weight: 500;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        #submit-btn {
            background: linear-gradient(135deg, #6c5ce7, #a393f5);
            color: white;
            box-shadow: 0 4px 15px rgba(108, 92, 231, 0.3);
        }

        #submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(108, 92, 231, 0.4);
        }

        #cancel-btn {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            backdrop-filter: blur(4px);
        }

        #cancel-btn:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: translateY(-2px);
        }

        @keyframes popupIn {
            0% {
                transform: translate(-50%, -50%) scale(0.9);
                opacity: 0;
            }
            100% {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
        }

        @keyframes popupOut {
            0% {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
            100% {
                transform: translate(-50%, -50%) scale(0.9);
                opacity: 0;
            }
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            #combined-popup {
                width: 95%;
                padding: 25px;
            }

            #combined-popup h2 {
                font-size: 24px;
            }

            .input-field {
                min-width: 100%;
            }

            .button-group {
                flex-direction: column;
            }

            .popup-button {
                width: 100%;
            }

            .radio-options {
                flex-direction: column;
                gap: 10px;
            }
        }
    `;
    document.head.appendChild(styles);
}

export const popupHTML = `
    <div class="popup-content">
        <h2>Enter Data</h2>

        <div class="input-container">
            <div class="input-field">
                <label for="projectTitle">Project Title</label>
                <input
                    type="text"
                    id="projectTitle"
                    name="projectTitle"
                    placeholder="Enter project title"
                    autocomplete="off"
                >
            </div>

            <div class="input-field">
                <label for="relatedAudits">Audit Counts</label>
                <input
                    type="number"
                    id="relatedAudits"
                    name="relatedAudits"
                    placeholder="Enter number of audits"
                    min="0"
                >
            </div>
        </div>

        <div class="input-field">
            <label for="comment-text">Comment</label>
            <textarea
                id="comment-text"
                rows="4"
                placeholder="Enter your comment here..."
            ></textarea>
        </div>

        <div class="radio-group">
            <label class="radio-label">Are you the PL?</label>
            <div class="radio-options">
                <label class="radio-option">
                    <input type="radio" id="areYouPLYes" name="areYouPL" value="Yes">
                    <span class="radio-label">Yes</span>
                </label>

                <label class="radio-option">
                    <input type="radio" id="areYouPLNo" name="areYouPL" value="No">
                    <span class="radio-label">No</span>
                </label>

                <label class="radio-option">
                    <input type="radio" id="areYouPLNA" name="areYouPL" value="N/A">
                    <span class="radio-label">N/A</span>
                </label>
            </div>
        </div>

        <div class="button-group">
            <button type="button" id="submit-btn" class="popup-button">
                Submit
            </button>
            <button type="button" id="cancel-btn" class="popup-button">
                Cancel
            </button>
        </div>
    </div>
`;
