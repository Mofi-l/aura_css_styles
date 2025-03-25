export function injectDateRangeStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        .date-range-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            z-index: 1000;
        }

        .date-range-modal.fade-in {
            opacity: 1;
        }

        .date-range-modal.fade-out {
            opacity: 0;
        }

        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .modal-content {
            background: #232f3e;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
            text-align: center;
            width: auto;
            max-width: 90%;
            position: relative;
        }

        .modal-content h2 {
            margin-bottom: 15px;
            font-size: 1.5rem;
            color: #ffffff;
        }

        .modal-content p {
            margin-bottom: 20px;
            font-size: 0.95rem;
            color: #999999;
        }

        #calendar-container {
            margin-bottom: 20px;
        }

        .button-container {
            display: flex;
            justify-content: space-between;
            gap: 15px;
            margin-top: 20px;
        }

        .btn-primary, .btn-secondary {
            flex: 1;
            padding: 12px;
            font-size: 0.875rem;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .btn-primary {
            background: linear-gradient(90deg, #28a745, #218838);
            color: white;
        }

        .btn-secondary {
            background-color: #6c757d;
            color: white;
        }

        .btn-primary:hover {
            background: linear-gradient(90deg, #218838, #1e7e34);
            transform: translateY(-1px);
        }

        .btn-secondary:hover {
            background-color: #5a6268;
            transform: translateY(-1px);
        }

        .flatpickr-calendar {
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 16px;
            width: 307px !important;
        }

        .flatpickr-months {
            background-color: #232f3e;
            border-radius: 8px 8px 0 0;
            padding: 10px 0;
        }

        .flatpickr-month {
            color: #ffffff !important;
        }

        .flatpickr-current-month {
            font-size: 1.1em;
            padding: 0;
        }

        .flatpickr-current-month input.cur-year {
            color: #ffffff;
        }

        .flatpickr-monthDropdown-months {
            color: #000000;
        }

        .flatpickr-weekdays {
            background-color: #ffffff;
            margin-top: 8px;
        }

        .flatpickr-weekday {
            color: #232f3e !important;
            font-weight: 600;
        }

        .flatpickr-day {
            border-radius: 6px;
            color: #333333;
            margin: 2px;
            height: 36px;
            line-height: 36px;
            width: 36px;
        }

        .flatpickr-day.selected,
        .flatpickr-day.startRange,
        .flatpickr-day.endRange {
            background-color: #232f3e;
            border-color: #232f3e;
            color: #ffffff;
        }

        .flatpickr-day.inRange {
            background-color: #e6eaf0;
            border-color: #e6eaf0;
            color: #232f3e;
        }

        .flatpickr-day:hover {
            background-color: #f5f6f7;
            border-color: #f5f6f7;
        }

        .flatpickr-day.today {
            border-color: #232f3e;
        }

        .flatpickr-day.today:hover {
            background-color: #232f3e;
            color: #ffffff;
        }

        @media (max-width: 480px) {
            .modal-content {
                padding: 16px;
                width: 95%;
            }

            .button-container {
                flex-direction: column;
            }

            .btn-primary, .btn-secondary {
                width: 100%;
            }
        }
    `;
    document.head.appendChild(styleSheet);
}
