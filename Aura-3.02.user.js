// ==UserScript==
// @name         Aura
// @namespace    Paragon_Microsites_NPT_SESU
// @author       mofila@
// @description  Automated Utility & Resource Assistant for team Microsites
// @include      /^https:\/\/paragon-(na|eu|fe)\.amazon\.com\/hz\/lobby$/
// @require      https://sdk.amazonaws.com/js/aws-sdk-2.1109.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/amazon-cognito-identity-js/5.2.1/amazon-cognito-identity.min.js
// @updateURL    https://raw.githubusercontent.com/Mofi-l/aura-tool/main/aura.meta.js
// @downloadURL  https://raw.githubusercontent.com/Mofi-l/aura-tool/main/aura.user.js
// @version      3.02
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const currentVersion = "3.02";
    let animationFrameId = null;
    let timerUpdateDebounce = null;
    ///////////////////////////////////////////////////////////////
    // Single, centralized authentication function
    const AuthService = {
        isAuthenticated: false,
        authToken: null,
        lastAuthTime: null,
        tokenExpiry: 3600000, // 1 hour in milliseconds

        async authenticate(username, password) {
            try {
                // Load required SDKs
                await loadCognitoSDK();

                const authenticationData = {
                    Username: username,
                    Password: password
                };

                const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);

                const poolData = {
                    UserPoolId: 'eu-north-1_V9kLPNVXl',
                    ClientId: '68caeoofa7hl7p7pvs65bb2hrv'
                };

                const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
                const userData = {
                    Username: username,
                    Pool: userPool
                };

                const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);


                return new Promise((resolve, reject) => {
                    cognitoUser.authenticateUser(authenticationDetails, {
                        onSuccess: async (result) => {
                            const token = result.getIdToken().getJwtToken();

                            // Update authentication state
                            this.isAuthenticated = true;
                            this.authToken = token;
                            this.lastAuthTime = Date.now();

                            // Store credentials securely
                            localStorage.setItem('lastAuthUsername', username);
                            localStorage.setItem('lastAuthPassword', password);

                            // Configure AWS with the token
                            try {
                                await configureAWS(token);

                                const s3 = new AWS.S3();
                                const today = new Date().toISOString().split('T')[0];

                                try {
                                    // Try to get existing login time from AWS
                                    const response = await s3.getObject({
                                        Bucket: 'real-time-databucket',
                                        Key: `login-times/${username}_${today}.json`
                                }).promise();

                                    const data = JSON.parse(response.Body.toString());
                                    if (data.loginTime) {
                                        // If found in AWS, store in localStorage
                                        localStorage.setItem('dailyLoginTime', data.loginTime);
                                    }
                                } catch (error) {
                                    if (error.code === 'NoSuchKey') {
                                        // Only set new login time if not found in AWS
                                        const newLoginTime = new Date().toLocaleTimeString('en-US', {
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            second: '2-digit',
                                            hour12: true
                                        });

                                        // Store new login time in localStorage
                                        localStorage.setItem('dailyLoginTime', newLoginTime);

                                        // Store new login time in AWS
                                        await s3.putObject({
                                            Bucket: 'real-time-databucket',
                                            Key: `login-times/${username}_${today}.json`,
                                            Body: JSON.stringify({
                                                username: username,
                                                date: today,
                                                loginTime: newLoginTime
                                            }),
                                            ContentType: 'application/json'
                                        }).promise();
                                    } else {
                                        // Log other AWS errors
                                        console.error('AWS Error:', error);
                                    }
                                }
                            } catch (error) {
                                console.error('Error checking/setting login time:', error);
                            }

                            resolve(token);
                        },
                        onFailure: (err) => {
                            this.isAuthenticated = false;
                            this.authToken = null;

                            // Clear stored credentials on auth failure
                            if (err.name === 'NotAuthorizedException') {
                                localStorage.removeItem('lastAuthUsername');
                                localStorage.removeItem('lastAuthPassword');
                            }

                            reject(err);
                        }
                    });
                });

            } catch (error) {
                console.log('Authentication error:', error);
                this.isAuthenticated = false;
                this.authToken = null;
                throw error;
            }
        },

        isTokenExpired() {
            return !this.lastAuthTime || (Date.now() - this.lastAuthTime > this.tokenExpiry);
        },

        async getValidToken() {
            const username = localStorage.getItem('lastAuthUsername');
            const password = localStorage.getItem('lastAuthPassword');

            if (!username || !password) {
                return null;
            }

            try {
                return await this.authenticate(username, password);
            } catch (error) {
                console.log('Token refresh failed:', error);
                return null;
            }
        },

        async ensureAuthenticated() {
            if (this.isAuthenticated && !this.isTokenExpired()) {
                return this.authToken;
            }

            const token = await this.getValidToken();
            if (token) {
                return token;
            }

            // Create and show existing auth modal
            return new Promise((resolve, reject) => {
                const modal = createAuthModal();
                document.body.appendChild(modal);

                document.getElementById('auth-submit').addEventListener('click', async () => {
                    const username = document.getElementById('username').value.trim();
                    const password = document.getElementById('password').value.trim();

                    if (!username || !password) {
                        showCustomAlert('Both username and password are required.');
                        return;
                    }

                    try {
                        const token = await this.authenticate(username, password);
                        modal.remove();
                        resolve(token);
                    } catch (error) {
                        console.error('Authentication error:', error);
                        showCustomAlert('Authentication failed. Please try again.');
                    }
                });

                document.getElementById('auth-cancel').addEventListener('click', () => {
                    modal.remove();
                    reject(new Error('Authentication cancelled'));
                });
            });
        },

        clearAuth() {
            this.isAuthenticated = false;
            this.authToken = null;
            this.lastAuthTime = null;
            localStorage.removeItem('lastAuthUsername');
            localStorage.removeItem('lastAuthPassword');
        }
    };

    // AWS Configuration helper
    async function configureAWS(token) {
        AWS.config.update({
            region: 'eu-north-1',
            credentials: new AWS.CognitoIdentityCredentials({
                IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                Logins: {
                    'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                }
            })
        });

        // Wait for credentials to be initialized
        return new Promise((resolve, reject) => {
            AWS.config.credentials.get(err => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
    ///////////////////////////////////////////////////////////////
    //Check for Updates, alerts and Clear Local storage
    let isTabFocused = true;
    let alertShown = false;

    window.addEventListener('focus', () => {
        isTabFocused = true;
    });

    window.addEventListener('blur', () => {
        isTabFocused = false;
    });

    const targetURLs = [
        'https://paragon-na.amazon.com/hz/lobby',
        'https://paragon-na.amazon.com/hz/lobby/v2',
        'https://paragon-eu.amazon.com/hz/lobby',
        'https://paragon-eu.amazon.com/hz/lobby/v2',
        'https://paragon-fe.amazon.com/hz/lobby',
        'https://paragon-fe.amazon.com/hz/lobby/v2'
    ];

    // if (targetURLs.includes(window.location.href)) {
    // const alreadyOpened = localStorage.getItem('projectDetailsOpened');
    // const confirmationShown = sessionStorage.getItem('projectDetailsConfirmationShown');

    // if (!alreadyOpened && !confirmationShown) {
    // showCustomConfirm('Please click "Yes" to update the project details for today without fail.', (userConfirmed) => {
    // if (userConfirmed) {
    // showProjectDetailsForm();
    // localStorage.setItem('projectDetailsOpened', 'true');
    // }
    // sessionStorage.setItem('projectDetailsConfirmationShown', 'true');
    // });
    // }
    //  }

    function clearLocalStorageIfNeeded() {
        const now = new Date();
        const currentHour = now.getHours();
        const todayDate = now.toISOString().split('T')[0];
        const lastClearedDate = localStorage.getItem('lastClearedDate');

        if (!lastClearedDate || (lastClearedDate !== todayDate && currentHour >= 5)) {
            // Save critical data before clearing
            const initialLoginTime = localStorage.getItem('initialLoginTime');
            const dailyLoginTime = localStorage.getItem('dailyLoginTime');
            const lastLoginDate = localStorage.getItem('lastLoginDate');
            const authUsername = localStorage.getItem('lastAuthUsername');
            const authPassword = localStorage.getItem('lastAuthPassword');
            const totalSteppingAwayTime = localStorage.getItem('totalSteppingAwayTime');

            // Clear localStorage
            localStorage.clear();

            // Restore critical data
            if (initialLoginTime) localStorage.setItem('initialLoginTime', initialLoginTime);
            if (dailyLoginTime) localStorage.setItem('dailyLoginTime', dailyLoginTime);
            if (lastLoginDate) localStorage.setItem('lastLoginDate', lastLoginDate);
            if (authUsername) localStorage.setItem('lastAuthUsername', authUsername);
            if (authPassword) localStorage.setItem('lastAuthPassword', authPassword);
            if (totalSteppingAwayTime) localStorage.setItem('totalSteppingAwayTime', totalSteppingAwayTime);

            localStorage.setItem('lastClearedDate', todayDate);
        }
    }

    clearLocalStorageIfNeeded();

    function showCustomAlert(message) {
        const styles = document.createElement('style');
        styles.textContent = `
        .custom-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 10002;
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
        document.head.appendChild(styles);

        const overlay = document.createElement('div');
        overlay.className = 'custom-overlay';

        const alertBox = document.createElement('div');
        alertBox.className = 'custom-alert-box';

        const alertMessage = document.createElement('p');
        alertMessage.className = 'custom-message';
        alertMessage.textContent = message;

        const okButton = document.createElement('button');
        okButton.textContent = 'Got it!';
        okButton.className = 'custom-button primary';

        okButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        alertBox.appendChild(alertMessage);
        alertBox.appendChild(okButton);
        overlay.appendChild(alertBox);
        document.body.appendChild(overlay);
    }

    function showCustomConfirm(message, callback) {
        const styles = document.createElement('style');
        styles.textContent = `
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
        document.head.appendChild(styles);
        const overlay = document.createElement('div');
        overlay.className = 'custom-overlay';

        const confirmBox = document.createElement('div');
        confirmBox.className = 'custom-alert-box';

        const confirmMessage = document.createElement('p');
        confirmMessage.className = 'custom-message';
        confirmMessage.textContent = message;

        const yesButton = document.createElement('button');
        yesButton.textContent = 'Yes';
        yesButton.className = 'custom-button primary';

        const noButton = document.createElement('button');
        noButton.textContent = 'No';
        noButton.className = 'custom-button danger';

        yesButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            callback(true);
        });

        noButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            callback(false);
        });

        confirmBox.appendChild(confirmMessage);
        confirmBox.appendChild(yesButton);
        confirmBox.appendChild(noButton);
        overlay.appendChild(confirmBox);
        document.body.appendChild(overlay);
    }
    ///////////////////////////////////////////////////////////////
    //Save and Display AUX data//
    // Function to save AUX data to localStorage
    function saveAUXData(entry) {
        const auxData = JSON.parse(localStorage.getItem('auxData')) || [];

        auxData.forEach(entry => {
            if (!entry.hasOwnProperty('isEdited')) {
                entry.isEdited = "N/A";
            }
            if (!entry.hasOwnProperty('editReason')) {
                entry.editReason = "";
            }
        });
        localStorage.setItem('auxData', JSON.stringify(auxData));

        const username = entry.username || localStorage.getItem("currentUsername");
        if (!username) {
            console.error("Username is missing. Data cannot be saved.");
            return;
        }

        const timeSpentInSeconds = entry.timeSpent / 1000;
        const timeInMinutes = timeSpentInSeconds / 60;
        const timeInHours = timeInMinutes / 60;

        function saveUniqueValue(key, value) {
            let storedValues = JSON.parse(localStorage.getItem(key)) || [];
            if (value && !storedValues.includes(value)) {
                storedValues.push(value);
                localStorage.setItem(key, JSON.stringify(storedValues));
            }
        }

        function updateEntry(entryToUpdate, key, newValue) {
            if (!newValue) return;

            // Special handling for relatedAudits
            if (key === 'relatedAudits') {
                // If the field doesn't exist yet, initialize it
                if (!entryToUpdate[key]) {
                    entryToUpdate[key] = '';
                }
                // Store as string value directly
                entryToUpdate[key] = newValue.toString();
                return;
            }

            // For other fields that might need array handling
            if (!entryToUpdate[key]) {
                entryToUpdate[key] = [];
            }

            if (Array.isArray(entryToUpdate[key])) {
                if (!entryToUpdate[key].includes(newValue)) {
                    entryToUpdate[key].push(newValue);
                }
            } else {
                // If not an array, just set the value
                entryToUpdate[key] = newValue;
            }
        }


        function splitAuxLabel(auxLabel) {
            if (!auxLabel || typeof auxLabel !== 'string') {
                return ['N/A', 'N/A', 'N/A'];
            }

            const parts = auxLabel.split(' - ').map(part => {
                const trimmed = part.trim();
                if (!trimmed || trimmed === 'undefined' || /^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
                    return 'N/A';
                }
                return trimmed;
            });

            while (parts.length < 3) {
                parts.push('N/A');
            }

            if (/^\d{1,2}:\d{2}:\d{2}$/.test(parts[0])) {
                parts[0] = entry.auxLabel ? entry.auxLabel.split(' - ')[0] : 'N/A';
            }

            return parts;
        }

        // Find relevant entries with Conduct Project
        const relevantEntries = auxData
        .map((item, index) => ({ item, index }))
        .filter(({ item }) =>
                item &&
                item.auxLabel3 &&
                item.auxLabel3.trim() === 'Conduct Project'
               );

        console.log('Found Conduct Project entries:', relevantEntries.length);

        // Get the last Conduct Project entry
        const lastEntry = relevantEntries.length > 0
        ? relevantEntries[relevantEntries.length - 1].item
        : null;
        const lastIndex = relevantEntries.length > 0
        ? relevantEntries[relevantEntries.length - 1].index
        : -1;

        console.log('Last Conduct Project entry:', lastEntry);

        // Get related audits from either entry or localStorage
        const relatedAudits = entry.relatedAudits ||
              localStorage.getItem('relatedAudits-' + entry.auxLabel);

        // Update last Conduct Project entry with related audits
        if (lastEntry && relatedAudits) {
            updateEntry(lastEntry, 'relatedAudits', relatedAudits);
            auxData[lastIndex] = lastEntry;
            console.log('Updated last Conduct Project entry with audit:', relatedAudits);
        }

        // Save unique value for related audits
        saveUniqueValue('relatedAudits', relatedAudits);

        // Process current AUX label
        const currentAuxLabel = entry.auxLabel || "N/A - N/A - N/A";
        const originalParts = currentAuxLabel.split(' - ').map(part => part.trim());
        const [auxLabel1, auxLabel2, auxLabel3] = originalParts.length >= 3 ?
              originalParts : splitAuxLabel(currentAuxLabel);

        if (currentAuxLabel === "Offline - N/A - N/A") {
            const existingOfflineIndex = auxData.findIndex(item =>
                                                           item && item.auxLabel === "Offline - N/A - N/A"
                                                          );

            if (existingOfflineIndex === -1) {
                const uniqueId = username + "-" + entry.date + "-" + currentAuxLabel + "-" +
                      Math.random().toString(36).substr(2, 9);

                // Update last entry again before saving new entry
                if (lastEntry) {
                    updateEntry(lastEntry, 'relatedAudits', relatedAudits);
                    auxData[lastIndex] = lastEntry;
                }

                const weekNo = getWeekNumber(new Date());
                const site = loadMSSiteData()[username] || 'SESU';

                const newEntry = {
                    uniqueId: uniqueId,
                    date: entry.date,
                    weekNo: weekNo,
                    username: username,
                    auxLabel: currentAuxLabel,
                    auxLabel1: auxLabel1 || 'Offline',
                    auxLabel2: auxLabel2 || 'N/A',
                    auxLabel3: auxLabel3 || 'N/A',
                    timeSpent: entry.timeSpent,
                    timeMinutes: timeInMinutes.toFixed(2),
                    timeHours: timeInHours.toFixed(2),
                    projectTitle: entry.projectTitle || localStorage.getItem('projectTitle-' + currentAuxLabel) || 'N/A',
                    relatedAudits: entry.relatedAudits || 'N/A',
                    areYouPL: entry.areYouPL || localStorage.getItem('areYouPL-' + currentAuxLabel) || 'N/A',
                    comment: entry.comment || localStorage.getItem('comment-' + currentAuxLabel) || 'N/A',
                    site: site,
                    isEdited: entry.isEdited || 'N/A',
                    editReason: entry.editReason || 'N/A',
                    loginTime: localStorage.getItem('dailyLoginTime') || 'N/A',
                    logoutTime: localStorage.getItem('dailyLogoutTime') || 'N/A'
                };

                auxData.push(newEntry);
                localStorage.setItem('auxData', JSON.stringify(auxData));
                console.log('Offline entry saved:', newEntry);
                displayAUXData(false);
            } else {
                console.log('Offline entry already exists. Skipping duplicate.');
            }
        } else if (timeSpentInSeconds > 5) {
            const uniqueId = username + "-" + entry.date + "-" + currentAuxLabel + "-" +
                  Math.random().toString(36).substr(2, 9);
            const existingEntryIndex = auxData.findIndex(item => item.uniqueId === uniqueId);

            // Update last entry again before saving new entry
            if (lastEntry) {
                updateEntry(lastEntry, 'relatedAudits', relatedAudits);
                auxData[lastIndex] = lastEntry;
            }

            if (existingEntryIndex === -1) {
                const weekNo = getWeekNumber(new Date());
                const site = loadMSSiteData()[username] || 'SESU';

                const newEntry = {
                    uniqueId: uniqueId,
                    date: entry.date,
                    weekNo: weekNo,
                    username: username,
                    auxLabel: currentAuxLabel,
                    auxLabel1: auxLabel1,
                    auxLabel2: auxLabel2,
                    auxLabel3: auxLabel3,
                    timeSpent: entry.timeSpent,
                    timeMinutes: timeInMinutes.toFixed(2),
                    timeHours: timeInHours.toFixed(2),
                    projectTitle: entry.projectTitle || localStorage.getItem('projectTitle-' + currentAuxLabel) || 'N/A',
                    relatedAudits: entry.relatedAudits || 'N/A',
                    areYouPL: entry.areYouPL || localStorage.getItem('areYouPL-' + currentAuxLabel) || 'N/A',
                    comment: entry.comment || localStorage.getItem('comment-' + currentAuxLabel) || 'N/A',
                    site: site,
                    isEdited: entry.isEdited || 'N/A',
                    editReason: entry.editReason || 'N/A',
                    loginTime: localStorage.getItem('dailyLoginTime') || 'N/A',
                    logoutTime: localStorage.getItem('dailyLogoutTime') || 'N/A'
                };

                auxData.push(newEntry);
                localStorage.setItem('auxData', JSON.stringify(auxData));
                console.log('AUX Data saved:', newEntry);
                displayAUXData(false);
            } else {
                console.log('Entry with the same unique identifier already exists.');
            }
        } else {
            console.log('Time spent is less than 5 seconds. Skipping entry.');
        }
    }

    // Function to display AUX data in a table
    let originalInputValues = null;

    function displayAUXData(showTable = false) {

        let auxData = JSON.parse(localStorage.getItem('auxData')) || [];
        auxData.forEach(entry => {
            if (!entry.hasOwnProperty('isEdited')) {
                entry.isEdited = "N/A";
            }
            if (!entry.hasOwnProperty('editReason')) {
                entry.editReason = "";
            }
        });
        localStorage.setItem('auxData', JSON.stringify(auxData));

        let popupContainer = document.getElementById('auxTablePopup');

        if (!popupContainer) {
            popupContainer = document.createElement('div');
            popupContainer.id = 'auxTablePopup';
            popupContainer.style.position = 'fixed';
            popupContainer.style.top = '50%';
            popupContainer.style.left = '50%';
            popupContainer.style.transform = 'translate(-50%, -50%)';
            popupContainer.style.backgroundColor = '#fff';
            popupContainer.style.border = '1px solid #ccc';
            popupContainer.style.padding = '20px';
            popupContainer.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            popupContainer.style.zIndex = '1000';
            popupContainer.style.maxWidth = '90%';
            popupContainer.style.maxHeight = '80vh';
            popupContainer.style.overflow = 'auto';
            document.body.appendChild(popupContainer);
        }

        const restoreTimestamp = localStorage.getItem('lastRestoreTimestamp');

        auxData = auxData.filter(entry => {
            const entryDate = new Date(entry.date).getTime();
            const entryTime = new Date(entry.date).toTimeString().split(' ')[0];

            if (restoreTimestamp) {
                if (entry.auxLabel === 'Late Login' &&
                    entryTime === '00:00:00' &&
                    entryDate >= restoreTimestamp) {
                    return false;
                }
            }
            return true;
        });

        auxData = auxData.filter(entry =>
                                 entry.auxLabel !== 'undefined - N/A - N/A' &&
                                 entry.date !== undefined
                                );

        if (auxData.length === 0) {
            popupContainer.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                No AUX Data available. Please refresh the page or view from a different page.
            </div>`;
            if (showTable) {
                popupContainer.style.display = 'block';
            }
            return;
        }

        const controlPanel = document.createElement('div');
        controlPanel.style.marginBottom = '15px';
        controlPanel.style.display = 'flex';
        controlPanel.style.justifyContent = 'space-between';
        controlPanel.style.alignItems = 'center';

        const editButton = document.createElement('button');
        editButton.textContent = 'Enable Editing';
        editButton.style.padding = '8px 16px';
        editButton.style.backgroundColor = '#007bff';
        editButton.style.color = 'white';
        editButton.style.border = 'none';
        editButton.style.borderRadius = '4px';
        editButton.style.cursor = 'pointer';
        editButton.style.marginRight = '10px';

        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save All Changes';
        saveButton.style.padding = '8px 16px';
        saveButton.style.backgroundColor = '#28a745';
        saveButton.style.color = 'white';
        saveButton.style.border = 'none';
        saveButton.style.borderRadius = '4px';
        saveButton.style.cursor = 'pointer';
        saveButton.style.display = 'none';

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete Entries';
        deleteButton.style.padding = '8px 16px';
        deleteButton.style.backgroundColor = '#dc3545';
        deleteButton.style.color = 'white';
        deleteButton.style.border = 'none';
        deleteButton.style.borderRadius = '4px';
        deleteButton.style.cursor = 'pointer';
        deleteButton.style.marginLeft = '10px';

        let isEditing = false;

        const tableContainer = document.createElement('div');
        tableContainer.style.overflowX = 'auto';
        tableContainer.style.width = '100%';

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginTop = '10px';
        table.style.backgroundColor = '#ffffff';

        const headers = [
            'Date',
            'Username',
            'AUX Label',
            'Time Spent',
            'Project Title',
            'Related Audits',
            'Are You PL',
            'Comment'
        ];

        headers.push('Is Edited', 'Edit Reason');

        const headerRow = table.insertRow();
        headers.forEach(headerText => {
            const header = document.createElement('th');
            header.textContent = headerText;
            header.style.padding = '12px';
            header.style.backgroundColor = '#f8f9fa';
            header.style.borderBottom = '2px solid #dee2e6';
            header.style.color = '#495057';
            header.style.fontWeight = 'bold';
            header.style.textAlign = 'left';
            headerRow.appendChild(header);
        });

        function showEditReasonPopup(callback) {
            const styles = document.createElement('style');
            styles.textContent = `
                .edit-reason-overlay {
                  position: fixed;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  background-color: rgba(0, 0, 0, 0.6);
                  z-index: 10002;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  backdrop-filter: blur(8px);
                  animation: overlayFadeIn 0.3s ease-out;
                }

    .edit-reason-box {
      background: linear-gradient(145deg, #2a2a2a, #323232);
      border-radius: 16px;
      padding: 25px 35px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3),
                  0 1px 8px rgba(0, 0, 0, 0.2),
                  0 0 1px rgba(255, 255, 255, 0.1) inset;
      text-align: center;
      max-width: 400px;
      width: 90%;
      animation: modalSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .edit-reason-message {
      margin-bottom: 25px;
      font-size: 1.1rem;
      line-height: 1.5;
      color: #ffffff;
      font-weight: 500;
    }

    .edit-reason-textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #ced4da;
      border-radius: 8px;
      resize: vertical;
      min-height: 100px;
      font-size: 1rem;
      margin-bottom: 20px;
    }

    .edit-reason-button {
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

    .edit-reason-button::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .edit-reason-button:hover::after {
      opacity: 1;
    }

    .edit-reason-submit {
      background: linear-gradient(135deg, #4CAF50, #43A047);
      color: white;
      box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
    }

    .edit-reason-submit:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
    }

    .edit-reason-cancel {
      background: linear-gradient(135deg, #FF5252, #D32F2F);
      color: white;
      box-shadow: 0 4px 15px rgba(255, 82, 82, 0.3);
    }

    .edit-reason-cancel:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255, 82, 82, 0.4);
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
      .edit-reason-box {
        width: 85%;
        padding: 20px 25px;
        margin: 20px;
      }

      .edit-reason-button {
        padding: 10px 20px;
        min-width: 80px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .edit-reason-overlay,
      .edit-reason-box {
        animation: none;
        transition: opacity 0.1s ease-in-out;
      }
    }
  `;
            document.head.appendChild(styles);

            const overlay = document.createElement('div');
            overlay.className = 'edit-reason-overlay';

            const box = document.createElement('div');
            box.className = 'edit-reason-box';

            const message = document.createElement('p');
            message.className = 'edit-reason-message';
            message.textContent = 'Please provide a reason for editing the AUX data table:';
            box.appendChild(message);

            const textarea = document.createElement('textarea');
            textarea.className = 'edit-reason-textarea';
            textarea.placeholder = 'Enter your reason here...';
            box.appendChild(textarea);

            const submitBtn = document.createElement('button');
            submitBtn.className = 'edit-reason-button edit-reason-submit';
            submitBtn.textContent = 'Submit Reason';
            box.appendChild(submitBtn);

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'edit-reason-button edit-reason-cancel';
            cancelBtn.textContent = 'Cancel';
            box.appendChild(cancelBtn);

            overlay.appendChild(box);
            document.body.appendChild(overlay);

            submitBtn.addEventListener('click', () => {
                const reason = textarea.value.trim();
                if (!reason) {
                    showCustomAlert('Please enter a reason.');
                    return;
                }
                document.body.removeChild(overlay);
                callback(reason); // Pass reason to callback
            });

            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                callback(null); // No reason provided
            });
        }

        function toggleEditMode() {
            isEditing = !isEditing;
            editButton.textContent = isEditing ? 'Disable Editing' : 'Enable Editing';
            editButton.style.backgroundColor = isEditing ? '#dc3545' : '#007bff';
            saveButton.style.display = isEditing ? 'block' : 'none';

            const inputs = table.getElementsByTagName('input');
            if (isEditing) {
                originalInputValues = {};

                for (let i = 0; i < inputs.length; i++) {
                    const input = inputs[i];
                    const row = input.closest('tr');
                    const rowIndex = Array.from(row.parentNode.children).indexOf(row) - 1;

                    // Map the column index to the correct field name
                    const columnIndex = Array.from(row.cells).indexOf(input.closest('td'));
                    let fieldKey;
                    switch(columnIndex) {
                        case 2: fieldKey = 'auxLabel'; break;
                        case 3: fieldKey = 'timeSpent'; break;
                        case 4: fieldKey = 'projectTitle'; break;
                        case 5: fieldKey = 'relatedAudits'; break;
                        case 6: fieldKey = 'areYouPL'; break;
                        case 7: fieldKey = 'comment'; break;
                        default: continue;
                    }

                    if (!originalInputValues[rowIndex]) {
                        originalInputValues[rowIndex] = {};
                    }

                    originalInputValues[rowIndex][fieldKey] = input.value;
                    console.log(`Stored original value for row ${rowIndex}, field ${fieldKey}:`, input.value);
                }
            }

            for (let input of inputs) {
                input.readOnly = !isEditing;
                input.style.backgroundColor = isEditing ? '#fff' : '#f8f9fa';
                input.style.border = isEditing ? '1px solid #ced4da' : 'none';
            }
        }

        editButton.onclick = () => {
            if (!isEditing) {
                showEditReasonPopup((reason) => {
                    if (reason) {
                        window.editReason = reason; // Store reason globally
                        toggleEditMode();
                    }
                });
            } else {
                toggleEditMode();
            }
        };
        saveButton.onclick = () => saveAllChanges(table, auxData);

        auxData.forEach((entry, index) => {
            const row = table.insertRow();
            headers.forEach(header => {
                const cell = row.insertCell();
                const key = header.toLowerCase()
                .replace(/ /g, '')
                .replace('areyoupl', 'areYouPL')
                .replace('relatedaudits', 'relatedAudits')
                .replace('timespent', 'timeSpent')
                .replace('projecttitle', 'projectTitle')
                .replace('auxlabel', 'auxLabel');

                if (header === 'Is Edited') {
                    // Create a span element to show edit status
                    const editStatus = document.createElement('span');
                    editStatus.textContent = entry.isEdited || 'N/A';
                    editStatus.className = 'edit-status';
                    cell.appendChild(editStatus);
                } else if (header === 'Edit Reason') {
                    cell.textContent = entry.editReason || '';
                } else {
                    // Existing rendering logic for other headers
                    if (key === 'date' || key === 'username') {
                        cell.textContent = entry[key] || 'N/A';
                    } else {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = key === 'timeSpent' ?
                            formatTime(entry[key] || 0) :
                        (entry[key] || '');
                        input.readOnly = true;
                        input.style.width = '100%';
                        input.style.padding = '6px';
                        input.style.border = 'none';
                        input.style.backgroundColor = '#f8f9fa';
                        input.style.borderRadius = '4px';
                        input.style.boxSizing = 'border-box';
                        cell.appendChild(input);
                    }
                }
            });
        });

        popupContainer.innerHTML = '';

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.position = 'absolute';
        closeButton.style.right = '10px';
        closeButton.style.top = '10px';
        closeButton.style.border = 'none';
        closeButton.style.background = 'none';
        closeButton.style.fontSize = '20px';
        closeButton.style.cursor = 'pointer';
        closeButton.onclick = () => {
            popupContainer.style.display = 'none';
        };

        if (localStorage.getItem('dataModified') === 'true') {
            const modifiedIndicator = document.createElement('div');
            modifiedIndicator.style.color = '#ff9800';
            modifiedIndicator.style.padding = '10px';
            modifiedIndicator.style.marginBottom = '10px';
            modifiedIndicator.style.backgroundColor = '#fff3e0';
            modifiedIndicator.style.borderRadius = '4px';
            modifiedIndicator.textContent = '* This data contains manual modifications';
            popupContainer.appendChild(modifiedIndicator);
        }

        controlPanel.appendChild(editButton);
        controlPanel.appendChild(saveButton);
        controlPanel.appendChild(deleteButton);
        deleteButton.onclick = () => handleDelete(table, auxData);
        popupContainer.appendChild(closeButton);
        popupContainer.appendChild(controlPanel);
        tableContainer.appendChild(table);
        popupContainer.appendChild(tableContainer);

        if (showTable) {
            popupContainer.style.display = 'block';
        } else {
            popupContainer.style.display = 'none';
        }
    }

    function handleDelete(table, auxData) {
        const rows = Array.from(table.rows).slice(1); // Skip header row

        // Add checkboxes to each row
        rows.forEach(row => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.marginRight = '10px';
            const firstCell = row.cells[0];
            firstCell.insertBefore(checkbox, firstCell.firstChild);
        });

        // Create delete confirmation buttons
        const deleteControls = document.createElement('div');
        deleteControls.style.marginTop = '10px';

        const confirmDelete = document.createElement('button');
        confirmDelete.textContent = 'Confirm Delete';
        confirmDelete.style.backgroundColor = '#dc3545';
        confirmDelete.style.color = 'white';
        confirmDelete.style.border = 'none';
        confirmDelete.style.borderRadius = '4px';
        confirmDelete.style.padding = '8px 16px';
        confirmDelete.style.marginRight = '10px';

        const cancelDelete = document.createElement('button');
        cancelDelete.textContent = 'Cancel';
        cancelDelete.style.backgroundColor = '#6c757d';
        cancelDelete.style.color = 'white';
        cancelDelete.style.border = 'none';
        cancelDelete.style.borderRadius = '4px';
        cancelDelete.style.padding = '8px 16px';

        deleteControls.appendChild(confirmDelete);
        deleteControls.appendChild(cancelDelete);
        table.parentNode.appendChild(deleteControls);

        confirmDelete.onclick = () => {
            const selectedIndexes = [];
            rows.forEach((row, index) => {
                const checkbox = row.cells[0].querySelector('input[type="checkbox"]');
                if (checkbox.checked) {
                    selectedIndexes.push(index);
                }
            });

            if (selectedIndexes.length === 0) {
                showCustomAlert('Please select entries to delete');
                return;
            }

            showCustomConfirm('Warning: This action cannot be undone. Are you sure you want to delete the selected entries?', (confirmed) => {
                if (confirmed) {
                    // Remove entries in reverse order to maintain correct indexes
                    for (let i = selectedIndexes.length - 1; i >= 0; i--) {
                        auxData.splice(selectedIndexes[i], 1);
                    }

                    localStorage.setItem('auxData', JSON.stringify(auxData));
                    localStorage.setItem('dataModified', 'true');
                    showCustomAlert('Selected entries have been deleted');
                    displayAUXData(true);
                }
            });
        };

        cancelDelete.onclick = () => {
            displayAUXData(true);
        };
    }


    function validateAuxLabelCombination(auxLabel) {
        if (!auxLabel) {
            throw new Error('AUX Label cannot be empty');
        }

        const parts = auxLabel.split(' - ');
        if (parts.length !== 3) {
            throw new Error('AUX Label must have three parts separated by " - "');
        }

        const [l1, l2, l3] = parts.map(part => part.trim());

        // Level 1 validation
        const validL1Names = Object.values(l1Names);
        if (!validL1Names.includes(l1)) {
            throw new Error(`Invalid Level 1 AUX: "${l1}". Must be one of: ${validL1Names.join(', ')}`);
        }

        // Get L1 key from value
        const l1Key = Object.keys(l1Names).find(key => l1Names[key] === l1);

        // Special case validations for L1 categories that should have N/A for L2 and L3
        const naOnlyL1Keys = ['1', '2', '5', '6']; // Contact Handling, On Break, Stepping Away, Offline
        if (naOnlyL1Keys.includes(l1Key)) {
            if (l2 !== 'N/A' || l3 !== 'N/A') {
                throw new Error(`${l1} should have N/A for both Level 2 and Level 3`);
            }
            return true;
        }

        // Level 2 validation
        if (l1Key === '3' || l1Key === '4') { // Microsite Project Work or Non-Microsite Work
            const validL2Options = l2Mapping[l1Key] || [];
            if (!validL2Options.includes(l2) && l2 !== 'N/A') {
                throw new Error(`Invalid Level 2 AUX for ${l1}: "${l2}"`);
            }
        } else if (l2 !== 'N/A') {
            throw new Error(`Level 2 should be N/A for ${l1}`);
        }

        // Level 3 validation
        if (l2 === 'N/A') {
            if (l3 !== 'N/A') {
                throw new Error('Level 3 must be N/A when Level 2 is N/A');
            }
            return true;
        }

        // Check L3 mapping
        const validL3Options = l3Mapping[l2];
        if (validL3Options) {
            if (!validL3Options.includes(l3)) {
                throw new Error(`Invalid Level 3 AUX for ${l2}: "${l3}". Must be one of: ${validL3Options.join(', ')}`);
            }
        } else {
            // If no L3 mapping exists for this L2, then L3 should be N/A
            if (l3 !== 'N/A') {
                throw new Error(`Level 3 should be N/A for ${l2}`);
            }
        }

        return true;
    }


    function validateTimeFormat(timeString) {
        // Check for HH:MM:SS format
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
        return timeRegex.test(timeString);
    }

    function validateAreYouPL(value) {
        const validValues = ['Yes', 'No', 'N/A'];
        return validValues.includes(value);
    }

    function validateRelatedAudits(value) {
        if (value === 'N/A') return true;
        if (!value) return true;
        return /^\d+$/.test(value);
    }

    function validateProjectTitle(title, auxLabel) {
        // First check if this is Microsite Project Work
        const isMicrositeWork = auxLabel && auxLabel.startsWith('Microsite Project Work');

        // If it's not Microsite Project Work, title should be empty or N/A
        if (!isMicrositeWork) {
            if (!title || title.trim() === '' || title.trim() === 'N/A') {
                return { isValid: true, message: '' };
            } else {
                return {
                    isValid: false,
                    message: 'Project title is only required for Microsite Project Work'
                };
            }
        }

        // For Microsite Project Work, title is required and must match patterns
        // Note: N/A is not allowed for Microsite Project Work
        if (!title || title.trim() === '' || title.trim() === 'N/A') {
            return {
                isValid: false,
                message: 'Project title is required for Microsite Project Work'
            };
        }

        // Remove any leading/trailing whitespace
        title = title.trim();

        // Check valid patterns for Microsite Project Work
        try {
            if (/^\d+$/.test(title)) {
                return { isValid: true, message: '' };
            }
            if (/^WF-\d+$/.test(title)) {
                return { isValid: true, message: '' };
            }
            if (/^Microsite-\d+$/.test(title)) {
                return { isValid: true, message: '' };
            }
            if (/^CL-.*$/.test(title)) {
                return { isValid: true, message: '' };
            }
            if (/^QA-.*$/.test(title)) {
                return { isValid: true, message: '' };
            }

            return {
                isValid: false,
                message: 'Invalid project title format. Must be numbers only, WF-numbers, Microsite-numbers, CL-anything, or QA-anything'
            };

        } catch (error) {
            return {
                isValid: false,
                message: 'Error validating project title'
            };
        }
    }

    function saveAllChanges(table, auxData) {
        showCustomConfirm('Are you sure you want to save all changes?', async (confirmed) => {
            if (confirmed) {
                try {
                    const rows = Array.from(table.rows).slice(1); // Skip header row
                    let hasAnyChanges = false;

                    rows.forEach((row, index) => {
                        const cells = row.cells;
                        const updatedEntry = { ...auxData[index] };
                        let rowChanged = false;

                        // Check each editable field for changes
                        const fields = {
                            auxLabel: 2,
                            timeSpent: 3,
                            projectTitle: 4,
                            relatedAudits: 5,
                            areYouPL: 6,
                            comment: 7
                        };

                        Object.entries(fields).forEach(([field, cellIndex]) => {
                            const originalValue = originalInputValues[index]?.[field] || '';
                            const currentInput = cells[cellIndex].querySelector('input');
                            const currentValue = currentInput ? currentInput.value : '';

                            if (originalValue !== currentValue) {
                                rowChanged = true;
                                hasAnyChanges = true;
                            }
                        });

                        // Handle edit status and reason
                        if (rowChanged) {
                            updatedEntry.isEdited = "Yes";
                            updatedEntry.editReason = window.editReason || "";
                            updatedEntry.lastModified = new Date().toISOString();
                        }

                        // Validate time format
                        const timeInput = cells[3].querySelector('input').value;
                        if (!validateTimeFormat(timeInput)) {
                            throw new Error(`Invalid time format in row ${index + 1}. Please use HH:MM:SS`);
                        }

                        // Validate AUX label
                        const auxLabel = cells[2].querySelector('input').value;
                        if (!validateAuxLabelCombination(auxLabel)) {
                            throw new Error(`Invalid AUX label combination in row ${index + 1}`);
                        }

                        // Validate Project Title
                        const projectTitle = cells[4].querySelector('input').value;
                        const titleValidation = validateProjectTitle(projectTitle, auxLabel);
                        if (!titleValidation.isValid) {
                            throw new Error(`Row ${index + 1}: ${titleValidation.message}`);
                        }

                        // Validate Are You PL
                        const areYouPL = cells[6].querySelector('input').value;
                        if (!validateAreYouPL(areYouPL)) {
                            throw new Error(`Invalid Are You PL value in row ${index + 1}. Must be Yes, No, or N/A`);
                        }

                        // Validate Related Audits
                        const relatedAudits = cells[5].querySelector('input').value;
                        if (!validateRelatedAudits(relatedAudits)) {
                            throw new Error(`Invalid Related Audits value in row ${index + 1}. Must be a number or N/A`);
                        }

                        // Update the entry
                        updatedEntry.auxLabel = auxLabel;
                        updatedEntry.timeSpent = parseTimeToMilliseconds(timeInput);
                        updatedEntry.projectTitle = projectTitle;
                        updatedEntry.relatedAudits = relatedAudits;
                        updatedEntry.areYouPL = areYouPL;
                        updatedEntry.comment = cells[7].querySelector('input').value;

                        auxData[index] = updatedEntry;
                    });

                    if (hasAnyChanges) {
                        localStorage.setItem('auxData', JSON.stringify(auxData));
                        localStorage.setItem('dataModified', 'true');
                        showCustomAlert('Changes saved successfully!');
                    } else {
                        showCustomAlert('No changes detected');
                    }

                    displayAUXData(true);

                } catch (error) {
                    showCustomAlert(error.message);
                }
            }
        });
    }


    // Helper function to get column index
    function getColumnIndex(fieldName) {
        const columnMap = {
            'auxLabel': 2,
            'timeSpent': 3,
            'projectTitle': 4,
            'relatedAudits': 5,
            'areYouPL': 6,
            'comment': 7
        };
        return columnMap[fieldName];
    }

    // Helper function to parse time to milliseconds
    function parseTimeToMilliseconds(timeString) {
        const [hours, minutes, seconds] = timeString.split(':').map(Number);
        return ((hours * 60 * 60) + (minutes * 60) + seconds) * 1000;
    }

    ///////////////////////////////////////////////////////////////
    //Front End CSV option//
    // Add the edit reason popup function
    function showEditReasonPopup(callback) {
        const styles = document.createElement('style');
        styles.textContent = `
        .edit-reason-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 10002;
            display: flex;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(8px);
            animation: overlayFadeIn 0.3s ease-out;
        }

        .edit-reason-box {
            background: linear-gradient(145deg, #2a2a2a, #323232);
            border-radius: 16px;
            padding: 25px 35px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3),
                        0 1px 8px rgba(0, 0, 0, 0.2),
                        0 0 1px rgba(255, 255, 255, 0.1) inset;
            text-align: center;
            max-width: 400px;
            width: 90%;
            animation: modalSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .edit-reason-message {
            margin-bottom: 25px;
            font-size: 1.1rem;
            line-height: 1.5;
            color: #ffffff;
            font-weight: 500;
        }

        .edit-reason-textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid #ced4da;
            border-radius: 8px;
            resize: vertical;
            min-height: 100px;
            font-size: 1rem;
            margin-bottom: 20px;
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }

        .edit-reason-button {
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

        .edit-reason-button::after {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        .edit-reason-button:hover::after {
            opacity: 1;
        }

        .edit-reason-submit {
            background: linear-gradient(135deg, #4CAF50, #43A047);
            color: white;
            box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
        }

        .edit-reason-submit:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
        }

        .edit-reason-cancel {
            background: linear-gradient(135deg, #FF5252, #D32F2F);
            color: white;
            box-shadow: 0 4px 15px rgba(255, 82, 82, 0.3);
        }

        .edit-reason-cancel:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 82, 82, 0.4);
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
    `;
        document.head.appendChild(styles);

        const overlay = document.createElement('div');
        overlay.className = 'edit-reason-overlay';

        const box = document.createElement('div');
        box.className = 'edit-reason-box';

        const message = document.createElement('p');
        message.className = 'edit-reason-message';
        message.textContent = 'Please provide a reason for uploading this CSV file:';
        box.appendChild(message);

        const textarea = document.createElement('textarea');
        textarea.className = 'edit-reason-textarea';
        textarea.placeholder = 'Enter your reason here...';
        box.appendChild(textarea);

        const submitBtn = document.createElement('button');
        submitBtn.className = 'edit-reason-button edit-reason-submit';
        submitBtn.textContent = 'Submit';
        box.appendChild(submitBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'edit-reason-button edit-reason-cancel';
        cancelBtn.textContent = 'Cancel';
        box.appendChild(cancelBtn);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        submitBtn.addEventListener('click', () => {
            const reason = textarea.value.trim();
            if (!reason) {
                showCustomAlert('Please enter a reason.');
                return;
            }
            document.body.removeChild(overlay);
            callback(reason);
        });

        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            callback(null);
        });
    }

    function restoreFromCSV(event) {
        const file = event.target.files[0];
        if (!file) {
            console.error('No file selected');
            return;
        }

        showEditReasonPopup((reason) => {
            if (!reason) {
                showCustomAlert('Edit reason is required to restore CSV');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const contents = e.target.result;
                    const lines = contents.split('\n').slice(1); // Skip header row
                    const validatedData = [];
                    const errors = [];

                    lines.forEach((line, index) => {
                        if (!line.trim()) return;

                        const columns = line.split(',').map(col => col.trim().replace(/^["']+|["']+$/g, ''));
                        const rowNum = index + 2;

                        try {
                            // Construct full AUX label
                            const fullAuxLabel = `${columns[3]} - ${columns[4]} - ${columns[5]}`;

                            // Use the validateAuxLabelCombination function
                            try {
                                validateAuxLabelCombination(fullAuxLabel);
                            } catch (auxError) {
                                errors.push(`Row ${rowNum}: ${auxError.message}`);
                                return;
                            }

                            // Validate Project Title only for Microsite Project Work
                            if (columns[3] === 'Microsite Project Work') {
                                if (!columns[8]) {
                                    errors.push(`Row ${rowNum}: Project title is required for Microsite Project Work`);
                                } else {
                                    // Check project title format
                                    const isValidFormat = /^\d+$/.test(columns[8]) ||
                                          /^WF-\d+$/.test(columns[8]) ||
                                          /^Microsite-\d+$/.test(columns[8]) ||
                                          /^CL-.*$/.test(columns[8]) ||
                                          /^QA-.*$/.test(columns[8]);

                                    if (!isValidFormat) {
                                        errors.push(`Row ${rowNum}: Invalid project title format`);
                                    }
                                }
                            }

                            // Validate Are You PL
                            const validPLValues = ['Yes', 'No', 'N/A'];
                            if (!validPLValues.includes(columns[10])) {
                                errors.push(`Row ${rowNum}: Invalid 'Are You PL' value. Must be Yes, No, or N/A`);
                            }

                            // Validate Related Audits (must be numbers only)
                            if (columns[9]) {
                                const isNA = columns[9].trim().toUpperCase() === 'N/A';
                                const isNumber = /^\d+$/.test(columns[9]);

                                if (!isNA && !isNumber) {
                                    errors.push(`Row ${rowNum}: Related audits must be either N/A or numbers only`);
                                }
                            }

                            // Convert time values
                            const timeMinutes = parseFloat(columns[6]);
                            let timeSpent;

                            if (!isNaN(timeMinutes)) {
                                const hours = Math.floor(timeMinutes / 60);
                                const minutes = Math.floor(timeMinutes % 60);
                                const seconds = Math.floor((timeMinutes * 60) % 60);
                                timeSpent = ((hours * 3600) + (minutes * 60) + seconds) * 1000; // Convert to milliseconds
                            } else {
                                timeSpent = 0;
                            }

                            // If no errors for this row, add to validated data
                            if (!errors.some(error => error.includes(`Row ${rowNum}:`))) {
                                validatedData.push({
                                    date: columns[0],
                                    weekNo: columns[1],
                                    username: columns[2],
                                    auxLabel: fullAuxLabel,
                                    timeSpent: timeSpent,
                                    projectTitle: columns[8] || 'N/A',
                                    relatedAudits: columns[9] || 'N/A',
                                    areYouPL: columns[10] || 'N/A',
                                    comment: columns[11] || 'N/A',
                                    site: columns[12] || 'N/A',
                                    isEdited: "Yes",
                                    editReason: reason,
                                    loginTime: columns[15] || 'N/A',
                                    logoutTime: columns[16] || 'N/A'
                                });
                            }

                        } catch (error) {
                            errors.push(`Row ${rowNum}: ${error.message}`);
                        }
                    });

                    // If there are any validation errors, show them and stop
                    if (errors.length > 0) {
                        showCustomAlert(`Validation errors found:\n\n${errors.join('\n')}`);
                        return;
                    }

                    // If all validations pass, proceed with restoration
                    if (validatedData.length > 0) {
                        const existingData = JSON.parse(localStorage.getItem('auxData')) || [];
                        const combinedData = [...existingData, ...validatedData];
                        localStorage.setItem('auxData', JSON.stringify(combinedData));
                        localStorage.setItem('dataModified', 'true');
                        showCustomAlert('CSV data restored successfully!');
                        displayAUXData(true);
                    } else {
                        showCustomAlert('No valid data found in CSV file');
                    }

                } catch (error) {
                    console.error('Error processing CSV:', error);
                    showCustomAlert('Error processing CSV file: ' + error.message);
                }
            };

            reader.onerror = function() {
                console.error('Error reading file:', reader.error);
                showCustomAlert('Error reading CSV file');
            };

            reader.readAsText(file);
        });
    }


    // Helper function to clean CSV field values
    function cleanCSVField(field) {
        if (!field) return '';
        return field.replace(/^["']+|["']+$/g, '').trim();
    }

    function exportToCSV(isPostAWSExport = false) {
        try {
            let auxDataString = localStorage.getItem('auxData');
            let auxData = JSON.parse(auxDataString) || [];
            console.log('AUX Data from localStorage (Parsed):', auxData);

            // Get the unique ID if available (means data was exported to AWS)
            const uniqueId = localStorage.getItem('lastExportUniqueId');

            // Load site mapping data first
            const siteMap = loadMSSiteData();
            const username = localStorage.getItem("currentUsername");

            const restoreTimestamp = localStorage.getItem('lastRestoreTimestamp');

            const loginTime = localStorage.getItem('dailyLoginTime');
            const logoutTime = localStorage.getItem('dailyLogoutTime');

            auxData = auxData.filter(entry => {
                const entryDate = new Date(entry.date).getTime();
                if (restoreTimestamp) {
                    if (entry.auxLabel === 'Late Login' && entryDate >= restoreTimestamp) {
                        return false;
                    }
                }
                return true;
            });

            auxData = auxData.filter(entry =>
                                     entry.auxLabel !== 'undefined - N/A - N/A' &&
                                     entry.date !== undefined
                                    );

            // Process and format each entry
            const processedData = auxData.map(entry => {
                // Ensure proper time conversion
                const timeSpentInSeconds = entry.timeSpent / 1000;
                const timeInMinutes = (timeSpentInSeconds / 60).toFixed(2);
                const timeInHours = (timeSpentInSeconds / 3600).toFixed(2);

                // Get week number
                const weekNo = getWeekNumber(new Date(entry.date));

                // Split AUX label into components with validation
                const auxLabels = (entry.auxLabel || "N/A - N/A - N/A").split(' - ').map(label => {
                    const trimmed = label.trim();
                    if (!trimmed || trimmed === 'undefined' || /^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
                        return 'N/A';
                    }
                    return trimmed;
                });
                while (auxLabels.length < 3) {
                    auxLabels.push('N/A');
                }

                // Get site from mapping or use default
                const site = siteMap[entry.username || username] || 'SESU';

                // Format logout time
                const isOffline = entry.auxLabel.toLowerCase().includes('offline');
                const currentLogoutTime = isOffline ? (logoutTime || new Date().toLocaleTimeString()) : 'N/A';

                return {
                    'Date': entry.date,
                    'Week No': weekNo,
                    'Username': entry.username || username,
                    'Aux Label 1': auxLabels[0],
                    'Aux Label 2': auxLabels[1],
                    'Aux Label 3': auxLabels[2],
                    'Time (minutes)': timeInMinutes,
                    'Time (hours)': timeInHours,
                    'Project Title': entry.projectTitle || 'N/A',
                    'Related Audits': entry.relatedAudits || 'N/A',
                    'Are You the PL?': entry.areYouPL || 'N/A',
                    'Comment': entry.comment || 'N/A',
                    'Site': site,
                    'Is Edited': entry.isEdited || 'N/A',
                    'Edit Reason': entry.editReason || 'N/A',
                    'Login Time (Local)': loginTime || 'N/A',
                    'Logout Time (Local)': currentLogoutTime
                };
            });

            // Create CSV headers
            const headers = [
                'Date',
                'Week No',
                'Username',
                'Aux Label 1',
                'Aux Label 2',
                'Aux Label 3',
                'Time (minutes)',
                'Time (hours)',
                'Project Title',
                'Related Audits',
                'Are You the PL?',
                'Comment',
                'Site',
                'Is Edited',
                'Edit Reason',
                'Login Time (Local)',
                'Logout Time (Local)'
            ];

            // Convert to CSV content with proper escaping
            const csvContent = "data:text/csv;charset=utf-8," +
                  headers.join(',') + '\n' +
                  processedData.map(row =>
                                    headers.map(header => {
                      const value = row[header] || '';
                      return `"${value.toString().replace(/"/g, '""')}"`;
                  }).join(',')
                                   ).join('\n');

            // Get username and format date
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];

            // Create and trigger download with formatted filename
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);

            // Set felename based on whether this is after AWS export
            if (isPostAWSExport) {
                // If after AWS export, try to get the unique ID
                const uniqueId = localStorage.getItem('dailyUniqueId');
                if (uniqueId) {
                    link.setAttribute('download', `aux_data_${username}_${dateStr}_${uniqueId}.csv`);
                } else {
                    link.setAttribute('download', `aux_data_${username}_${dateStr}.csv`);
                }
            } else {
                // Regular download without unique ID
                link.setAttribute('download', `aux_data_${username}_${dateStr}.csv`);
            }

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clear the current export unique ID if this was not post-AWS export
            if (!isPostAWSExport) {
                localStorage.removeItem('currentExportUniqueId');
            }

        } catch (error) {
            console.error('Error exporting AUX data to CSV:', error);
            showCustomAlert('Failed to export AUX data: ' + error.message);
        }
    }


    function separateAuxLabel(auxLabel) {
        if (!auxLabel || typeof auxLabel !== 'string') {
            return {
                label1: 'N/A',
                label2: 'N/A',
                label3: 'N/A'
            };
        }

        // Clean up the label first
        const cleanLabel = auxLabel.trim();

        // Split by delimiter and clean each part
        const parts = cleanLabel.split(' - ').map(part => part.trim());

        return {
            label1: parts[0] || 'N/A',
            label2: parts[1] || 'N/A',
            label3: parts[2] || 'N/A'
        };
    }

    // Helper function to load MS Sites data
    function loadMSSiteData() {
        return {
            'mofila': 'HYD',
            'thatikr': 'HYD',
            'nshsx': 'HYD',
            'artjoshi': 'HYD',
            'kotnisai': 'HYD',
            'mkkirth': 'HYD',
            'ehemoham': 'HYD',
            'khandavp': 'HYD',
            'mshoib': 'HYD',
            'mohaame': 'HYD',
            'mohdhme': 'HYD',
            'tirump': 'HYD',
            'rajibdut': 'HYD',
            'rhtng': 'HYD',
            'shbzkh': 'HYD',
            'shwetg': 'HYD',
            'tvant': 'HYD',
            'shendv': 'HYD',
            'varalv': 'HYD',
            'katsharm': 'HYD',
            'albuquea': 'HYD',
            'abollina': 'HYD',
            'ayabhatt': 'HYD',
            'mishayus': 'HYD',
            'mdiahmed': 'HYD',
            'maddirap': 'HYD',
            'prembhar': 'HYD',
            'rahulgi': 'HYD',
            'chellemr': 'HYD',
            'ramkeert': 'HYD',
            'majurupg': 'HYD',
            'shimontm': 'HYD',
            'dasouv': 'HYD',
            'bhaver': 'HYD',
            'nangunon': 'HYD',
            'purbitam': 'HYD',
            'nitscd': 'DE',
            'ebbraga': 'DE',
            'haffaris': 'DE',
            'metinees': 'DE',
            'annherrm': 'DE',
            'abdlahou': 'BCN',
            'ammaurel': 'BCN',
            'affalsap': 'BCN',
            'herbrun': 'BCN',
            'buenavef': 'BCN',
            'grrulli': 'BCN',
            'rccabbia': 'BCN',
            'radilor': 'BCN',
            'aalziat': 'BCN',
            'scarlopa': 'BCN',
            'guillaam': 'BCN',
            'qiach': 'PEK',
            'rongqing': 'PEK',
            'danyangl': 'PEK',
            'dongmwan': 'PEK',
            'wdongxu': 'PEK',
            'haiyabai': 'PEK',
            'jingjieh': 'PEK',
            'litia': 'PEK',
            'lijul': 'PEK',
            'lipinyua': 'PEK',
            'ningwa': 'PEK',
            'chngqc': 'PEK',
            'jiqing': 'PEK',
            'hongyun': 'PEK',
            'runtingg': 'PEK',
            'ruish': 'PEK',
            'tnwang': 'PEK',
            'weiwechu': 'PEK',
            'yanxij': 'PEK',
            'wuxiangj': 'PEK',
            'yaxiongg': 'PEK',
            'yuhatian': 'PEK',
            'wyunhan': 'PEK',
            'yunfeben': 'PEK',
            'caifeng': 'PEK',
            'zhewe': 'PEK',
            'zizheng': 'PEK',
            'heluo': 'PEK'
        };
    }
    ///////////////////////////////////////////////////////////////
    function injectAuthStyles() {
        const authStyles = document.createElement('style');
        authStyles.textContent = `
    .auth-modal {
        position: fixed;
        inset: 0;
        background-color: rgba(0, 0, 0, 0.85);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10002;
        backdrop-filter: blur(12px);
        animation: overlayFadeIn 0.3s ease-out;
    }

    .auth-modal-content {
        background: linear-gradient(145deg, #1a1a1a, #2d2d2d);
        padding: 35px;
        border-radius: 20px;
        width: min(90%, 420px);
        text-align: center;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.1);
        animation: modalSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .auth-modal-title {
        font-size: 28px;
        font-weight: 600;
        color: #ffffff;
        margin-bottom: 30px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }

    .auth-input-container {
        margin-bottom: 20px;
        position: relative;
    }

    .auth-input {
        width: 100%;
        padding: 14px 18px;
        padding-right: 45px;
        background: rgba(40, 40, 40, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        font-size: 15px;
        color: #ffffff;
        transition: all 0.2s ease;
        -webkit-appearance: none;
        appearance: none;
    }

    .auth-input:hover {
        background: rgba(45, 45, 45, 0.95);
    }

    .auth-input:focus {
        outline: none;
        border-color: #6c7bff;
        background: rgba(50, 50, 50, 0.95);
        box-shadow: 0 0 0 3px rgba(108, 123, 255, 0.1);
    }

    .auth-input::placeholder {
        color: rgba(255, 255, 255, 0.4);
    }

    .auth-input[type="password"] {
        color: #ffffff;
    }

    .auth-button-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
        margin-top: 30px;
    }

    .auth-submit-btn,
    .auth-cancel-btn {
        padding: 12px 28px;
        border: none;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .auth-submit-btn {
        background: linear-gradient(135deg, #5865f2, #818cf8);
        color: white;
        box-shadow: 0 6px 18px rgba(88, 101, 242, 0.25);
    }

    .auth-submit-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(88, 101, 242, 0.35);
    }

    .auth-cancel-btn {
        background: rgba(255, 255, 255, 0.08);
        color: white;
        backdrop-filter: blur(4px);
    }

    .auth-cancel-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        transform: translateY(-2px);
    }

    .toggle-password-btn {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .eye-icon {
        width: 20px;
        height: 20px;
        color: black;
        transition: fill 0.2s ease;
    }

    .toggle-password-**************-icon {
        color: black;
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
        .auth-modal-content {
            width: 95%;
            padding: 25px;
            margin: 20px;
        }

        .auth-button-container {
            grid-template-columns: 1fr;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .auth-modal,
        .auth-modal-content {
            animation: none;
        }
    }
                    `;
        document.head.appendChild(authStyles);
    }

    function loadCognitoSDK() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/amazon-cognito-identity-js/5.2.1/amazon-cognito-identity.min.js';
            script.onload = () => {
                console.log('Amazon Cognito SDK loaded successfully');
                resolve();
            };
            script.onerror = () => {
                console.warn('Primary SDK load failed. Trying alternate source.');
                const fallbackScript = document.createElement('script');
                fallbackScript.src = 'https://unpkg.com/amazon-cognito-identity-js@5.2.1/dist/amazon-cognito-identity.min.js';
                fallbackScript.onload = () => {
                    console.log('Fallback Amazon Cognito SDK loaded successfully');
                    resolve();
                };
                fallbackScript.onerror = () => {
                    console.error('Failed to load Amazon Cognito SDK from all sources');
                    reject(new Error('Failed to load Amazon Cognito SDK'));
                };
                document.head.appendChild(fallbackScript);
            };
            document.head.appendChild(script);
        });
    }

    const CognitoConfig = {
        UserPoolId: 'eu-north-1_V9kLPNVXl',
        ClientId: '68caeoofa7hl7p7pvs65bb2hrv',
        Region: 'eu-north-1',
    };

    async function authenticate(username, password) {
        const authenticationData = { Username: username, Password: password };
        const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);
        const poolData = {
            UserPoolId: CognitoConfig.UserPoolId,
            ClientId: CognitoConfig.ClientId,
        };
        const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
        const userData = { Username: username, Pool: userPool };
        const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

        return new Promise((resolve, reject) => {
            cognitoUser.authenticateUser(authenticationDetails, {
                onSuccess: function(result) {
                    const idToken = result.getIdToken().getJwtToken();
                    console.log('Token received:', idToken);
                    resolve(idToken);
                },
                onFailure: function(err) {
                    console.error('Authentication failed:', err);
                    reject(err);
                }
            });
        });
    }

    async function exportToAWS() {
        const isDataSent = localStorage.getItem('isDataSent') === 'true';

        if (isDataSent) {
            showCustomConfirm('Your NPT was already sent, do you want to send a duplicate entry?', (userConfirmed) => {
                if (!userConfirmed) return;
                authenticateAndExport();
            });
            return;
        }

        showCustomConfirm('Are you sure you want to export the data to AWS?', (userConfirmed) => {
            if (!userConfirmed) return;
            authenticateAndExport();
        });
    }

    async function authenticateAndExport() {
        try {
            injectAuthStyles();
            await loadAwsSdk();
            await loadCognitoSdk();

            const modal = createAuthModal();
            document.body.appendChild(modal);

            document.getElementById('auth-submit').addEventListener('click', async () => {
                const username = document.getElementById('username').value.trim();
                const password = document.getElementById('password').value.trim();

                if (!username || !password) {
                    showCustomAlert('Both username and password are required.');
                    return;
                }

                const submitBtn = document.getElementById('auth-submit');
                submitBtn.textContent = 'Authenticating...';
                submitBtn.style.opacity = '0.7';
                submitBtn.disabled = true;

                try {
                    const token = await authenticate(username, password);
                    console.log('Retrieved token:', token);
                    const auxDataString = localStorage.getItem('auxData');
                    let auxData = JSON.parse(auxDataString) || [];
                    console.log('Original AUX Data:', auxData);

                    const restoreTimestamp = localStorage.getItem('lastRestoreTimestamp');
                    auxData = auxData.filter(entry => {
                        const entryDate = new Date(entry.date).getTime();
                        if (restoreTimestamp) {
                            if (entry.auxLabel === 'Late Login' && entryDate >= restoreTimestamp) {
                                return false;
                            }
                        }
                        return true;
                    });

                    auxData = auxData.filter(entry =>
                                             entry.auxLabel !== 'undefined - N/A - N/A' &&
                                             entry.date !== undefined
                                            );

                    const exportedTime = new Date().toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                    });

                    // Create CSV rows array with headers
                    const csvRows = [];
                    csvRows.push([
                        'Date',
                        'Week No',
                        'Username',
                        'Aux Label 1',
                        'Aux Label 2',
                        'Aux Label 3',
                        'Time (minutes)',
                        'Time (hours)',
                        'Project Title',
                        'Related Audits',
                        'Are You the PL?',
                        'Comment',
                        'Site',
                        'Is Edited',
                        'Edit Reason',
                        'Login Time (Local)',
                        'Logout Time (Local)',
                        'Exported Time'
                    ].join(','));

                    // Process each entry
                    auxData.forEach(entry => {
                        try {
                            const loginTime = localStorage.getItem('dailyLoginTime');
                            const logoutTime = localStorage.getItem('dailyLogoutTime');
                            const isOffline = entry.auxLabel.toLowerCase().includes('offline');
                            const currentLogoutTime = isOffline ?
                                  (logoutTime || new Date().toLocaleTimeString()) : 'N/A';

                            // Split AUX Label safely
                            let auxLabels = ['N/A', 'N/A', 'N/A'];
                            if (entry.auxLabel) {
                                const labels = entry.auxLabel.split(' - ');
                                auxLabels = [
                                    labels[0] || 'N/A',
                                    labels[1] || 'N/A',
                                    labels[2] || 'N/A'
                                ];
                            }

                            // Convert time values properly
                            let timeMinutes = entry.timeMinutes;
                            if (typeof entry.timeSpent === 'number') {
                                // If timeSpent is in milliseconds, convert to minutes
                                timeMinutes = (entry.timeSpent / (1000 * 60)).toFixed(2);
                            } else if (typeof entry.timeSpent === 'string' && entry.timeSpent.includes(':')) {
                                // If timeSpent is in HH:MM:SS format
                                const [hours, minutes, seconds] = entry.timeSpent.split(':').map(Number);
                                timeMinutes = (hours * 60 + minutes + seconds/60).toFixed(2);
                            }

                            const timeHours = (parseFloat(timeMinutes) / 60).toFixed(2);

                            // Create row with proper escaping and time values
                            const row = [
                                escapeCSVField(entry.date),
                                escapeCSVField(entry.weekNo || getWeekNumber(new Date(entry.date))),
                                escapeCSVField(entry.username || "Unknown User"),
                                escapeCSVField(auxLabels[0]),
                                escapeCSVField(auxLabels[1]),
                                escapeCSVField(auxLabels[2]),
                                escapeCSVField(timeMinutes),
                                escapeCSVField(timeHours),
                                escapeCSVField(entry.projectTitle || 'N/A'),
                                escapeCSVField(entry.relatedAudits || 'N/A'),
                                escapeCSVField(entry.areYouPL || 'N/A'),
                                escapeCSVField(entry.comment || 'N/A'),
                                escapeCSVField(entry.site || 'SESU'),
                                escapeCSVField(entry.isEdited || 'N/A'),
                                escapeCSVField(entry.editReason || 'N/A'),
                                escapeCSVField(loginTime),
                                escapeCSVField(currentLogoutTime),
                                escapeCSVField(exportedTime)
                            ];

                            csvRows.push(row.join(','));
                        } catch (rowError) {
                            console.error('Error processing row:', rowError, entry);
                        }
                    });

                    // Join all rows with newlines
                    const csvContent = csvRows.join('\n');
                    console.log('CSV Content:', csvContent);

                    const response = await fetch('https://09umyreyjb.execute-api.eu-north-1.amazonaws.com/Prod/auxData', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'text/csv',
                            Authorization: token,
                        },
                        body: csvContent,
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to send data: ${response.statusText}`);
                    }

                    modal.remove();

                    // Record the export and get unique ID
                    const uniqueId = await recordAWSExport();

                    if (uniqueId) {
                        showCustomAlert('NPT Data successfully sent to AWS');

                        // Download CSV with unique ID
                        const username = localStorage.getItem("currentUsername");
                        const dateStr = new Date().toISOString().split('T')[0];

                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.setAttribute('href', url);
                        link.setAttribute('download', `aux_data_${username}_${dateStr}_${uniqueId}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                    }

                    localStorage.setItem('isDataSent', 'true');

                } catch (error) {
                    console.error('Error during AWS export:', error);
                    submitBtn.textContent = 'Submit';
                    submitBtn.style.opacity = '1';
                    submitBtn.disabled = false;
                    showCustomAlert('Failed to export NPT data. Please check your credentials or try again later.');
                }
            });

            document.getElementById('auth-cancel').addEventListener('click', () => {
                const authModal = modal.querySelector('.auth-modal');
                authModal.style.opacity = '0';
                setTimeout(() => {
                    modal.remove();
                }, 300);
            });

        } catch (error) {
            console.error('Error in authenticateAndExport:', error);
            showCustomAlert('Failed to initialize export process');
        }
    }
    ///////////////////////////////////////////////////////////////
    // Import from AWS
    async function selectDateRange() {

        await loadDateRangeStyles();

        return new Promise((resolve, reject) => {
            const flatpickrCSS = document.createElement('link');
            flatpickrCSS.rel = 'stylesheet';
            flatpickrCSS.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
            document.head.appendChild(flatpickrCSS);

            const flatpickrJS = document.createElement('script');
            flatpickrJS.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
            flatpickrJS.onload = () => {
                const modal = document.createElement('div');
                modal.className = 'date-range-modal';
                modal.innerHTML = `
                <div class="modal-overlay">
                    <div class="modal-content">
                        <h2>Select Date Range</h2>
                        <p>Click and drag to select the date range.</p>
                        <div id="calendar-container"></div>
                        <div class="button-container">
                            <button id="apply-date-range" class="btn-primary">OK</button>
                            <button id="cancel-date-range" class="btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            `;

                document.body.appendChild(modal);

                const calendar = document.getElementById('calendar-container');
                const flatpickrInstance = flatpickr(calendar, {
                    mode: 'range',
                    dateFormat: 'Y-m-d',
                    inline: true,
                    onClose: (selectedDates) => {
                        if (selectedDates.length < 2) {
                            showCustomAlert('Please select a date range.');
                        }
                    },
                });

                document.getElementById('apply-date-range').addEventListener('click', () => {
                    const selectedDates = flatpickrInstance.selectedDates;
                    if (selectedDates.length < 2) {
                        showCustomAlert('Please select a date range.');
                        return;
                    }

                    const startDateTime = selectedDates[0].getTime();
                    const endDateTime = selectedDates[1].getTime();

                    modal.classList.add('fade-out');
                    setTimeout(() => {
                        modal.remove();
                        flatpickrCSS.remove();
                    }, 300);
                    resolve({ startDateTime, endDateTime });
                });

                document.getElementById('cancel-date-range').addEventListener('click', () => {
                    modal.classList.add('fade-out');
                    setTimeout(() => {
                        modal.remove();
                        flatpickrCSS.remove();
                    }, 300);
                    reject('Date range selection canceled.');
                });

                setTimeout(() => modal.classList.add('fade-in'), 0);
            };
            document.body.appendChild(flatpickrJS);
        });
    }

    // Updated loadDateRangeStyles function
    async function loadDateRangeStyles() {
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
            background-color: #ffffff;
            border-radius: 8px 8px 0 0;
            padding: 10px 0;
        }

        .flatpickr-month {
            color: #000000 !important;
        }

        .flatpickr-current-month {
            font-size: 1.1em;
            padding: 0;
        }

        .flatpickr-current-month input.cur-year {
            color: #000000;
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

    function jsonToCsv(jsonData) {
        const headers = Object.keys(jsonData[0]).join(',');
        const rows = jsonData.map(row => Object.values(row).join(',')).join('\n');
        return `${headers}\n${rows}`;
    }

    function loadCognitoSdk() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/amazon-cognito-identity-js/5.2.1/amazon-cognito-identity.min.js';
            script.onload = () => {
                console.log('Amazon Cognito SDK loaded successfully');
                resolve();
            };
            script.onerror = () => {
                console.warn('Primary SDK load failed. Trying alternate source.');
                const fallbackScript = document.createElement('script');
                fallbackScript.src = 'https://unpkg.com/amazon-cognito-identity-js@5.2.1/dist/amazon-cognito-identity.min.js';
                fallbackScript.onload = () => {
                    console.log('Fallback Amazon Cognito SDK loaded successfully');
                    resolve();
                };
                fallbackScript.onerror = () => {
                    console.error('Failed to load Amazon Cognito SDK from all sources');
                    reject(new Error('Failed to load Amazon Cognito SDK'));
                };
                document.head.appendChild(fallbackScript);
            };
            document.head.appendChild(script);
        });
    }

    async function loadAwsSdk() {
        return new Promise((resolve, reject) => {
            if (typeof AWS !== 'undefined' && AWS.S3) {
                console.log('AWS SDK is already loaded and AWS.S3 is available.');
                resolve();
            } else {
                console.log('Loading AWS SDK...');
                const script = document.createElement('script');
                script.src = 'https://sdk.amazonaws.com/js/aws-sdk-2.1109.0.min.js';
                script.onload = () => {
                    console.log('AWS SDK loaded successfully.');
                    if (typeof AWS === 'undefined' || !AWS.S3) {
                        reject('AWS SDK loaded but AWS.S3 is not available');
                    } else {
                        resolve();
                    }
                };
                script.onerror = (error) => {
                    console.error('Failed to load AWS SDK', error);
                    reject('Failed to load AWS SDK');
                };
                document.head.appendChild(script);
            }
        });
    }

    async function importFromAws() {
        try {
            await injectAuthStyles();
            await loadAwsSdk();
            await loadCognitoSdk();

            // Get date range from user
            let startDateTime, endDateTime;
            try {
                const dateRange = await selectDateRange();
                startDateTime = dateRange.startDateTime;
                endDateTime = dateRange.endDateTime;
                console.log('Selected date range:', {
                    start: new Date(startDateTime).toISOString(),
                    end: new Date(endDateTime).toISOString()
                });
            } catch (err) {
                console.error('Date range selection error:', err);
                return;
            }

            // Get current username
            const username = localStorage.getItem("currentUsername");
            if (!username) {
                throw new Error('Username not found');
            }
            console.log('Searching for data for username:', username);

            // Authentication
            const token = await AuthService.ensureAuthenticated();
            await configureAWS(token);
            if (!token) throw new Error('Authentication failed');

            // Show loading indicator
            const loadingIndicator = createLoadingIndicator();
            document.body.appendChild(loadingIndicator);

            try {
                const s3 = new AWS.S3();
                const bucketName = 'aux-data-bucket';
                const relevantData = [];

                // 1. First check Aura_NPT_ files
                console.log('Checking Aura_NPT_ files...');
                const auraNptResponse = await s3.listObjectsV2({
                    Bucket: bucketName,
                    Prefix: 'Aura_NPT_'
                }).promise();

                // Process Aura_NPT_ files
                for (const item of auraNptResponse.Contents) {
                    const fileData = await s3.getObject({
                        Bucket: bucketName,
                        Key: item.Key
                    }).promise();

                    const rows = fileData.Body.toString('utf-8').split('\n');

                    // Skip header row and process each row
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i].trim();
                        if (!row) continue;

                        const columns = row.split(',').map(col => col.trim());
                        if (columns.length < 13) continue; // Ensure minimum columns exist

                        // Check if row belongs to current user and falls within date range
                        if (columns[2] === username) {
                            const rowDate = new Date(columns[0]);
                            if (rowDate >= new Date(startDateTime) && rowDate <= new Date(endDateTime)) {
                                relevantData.push({
                                    Date: columns[0],
                                    'Week No': columns[1],
                                    Username: columns[2],
                                    'Aux Label 1': columns[3],
                                    'Aux Label 2': columns[4],
                                    'Aux Label 3': columns[5],
                                    'Time (minutes)': columns[6],
                                    'Time (hours)': columns[7],
                                    'Project Title': columns[8],
                                    'Related Audits': columns[9],
                                    'Are You the PL?': columns[10],
                                    Comment: columns[11],
                                    Site: columns[12],
                                    'Is Edited': columns[13] || 'N/A',
                                    'Edit Reason': columns[14] || '',
                                    'Login Time (Local)': columns[15] || 'N/A',
                                    'Logout Time (Local)': columns[16] || 'N/A',
                                    'Exported Time': columns[17] || 'N/A'
                                });
                            }
                        }
                    }
                }

                // 2. Then check aux_data_ files with username pattern
                console.log('Checking aux_data_ files...');
                const auxDataPrefix = `aux_data_${username}_`;
                const auxDataResponse = await s3.listObjectsV2({
                    Bucket: bucketName,
                    Prefix: auxDataPrefix
                }).promise();

                // Process aux_data_ files
                for (const item of auxDataResponse.Contents) {
                    const fileData = await s3.getObject({
                        Bucket: bucketName,
                        Key: item.Key
                    }).promise();

                    const rows = fileData.Body.toString('utf-8').split('\n');

                    // Skip header row and process each row
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i].trim();
                        if (!row) continue;

                        const columns = row.split(',').map(col => col.trim());
                        if (columns.length < 13) continue;

                        const rowDate = new Date(columns[0]);
                        if (rowDate >= new Date(startDateTime) && rowDate <= new Date(endDateTime)) {
                            relevantData.push({
                                Date: columns[0],
                                'Week No': columns[1],
                                Username: columns[2],
                                'Aux Label 1': columns[3],
                                'Aux Label 2': columns[4],
                                'Aux Label 3': columns[5],
                                'Time (minutes)': columns[6],
                                'Time (hours)': columns[7],
                                'Project Title': columns[8],
                                'Related Audits': columns[9],
                                'Are You the PL?': columns[10],
                                Comment: columns[11],
                                Site: columns[12],
                                'Is Edited': columns[13] || 'N/A',
                                'Edit Reason': columns[14] || '',
                                'Login Time (Local)': columns[15] || 'N/A',
                                'Logout Time (Local)': columns[16] || 'N/A',
                                'Exported Time': columns[17] || 'N/A'
                            });
                        }
                    }
                }

                console.log(`Found ${relevantData.length} matching entries`);

                if (relevantData.length > 0) {
                    // Sort data by date
                    relevantData.sort((a, b) => new Date(a.Date) - new Date(b.Date));

                    // Create CSV content
                    const headers = [
                        'Date', 'Week No', 'Username', 'Aux Label 1', 'Aux Label 2', 'Aux Label 3',
                        'Time (minutes)', 'Time (hours)', 'Project Title', 'Related Audits',
                        'Are You the PL?', 'Comment', 'Site', 'Is Edited', 'Edit Reason',
                        'Login Time (Local)', 'Logout Time (Local)', 'Exported Time'
                    ];

                    const csvContent = [
                        headers.join(','),
                        ...relevantData.map(row => headers.map(header =>
                                                               `"${(row[header] || '').toString().replace(/"/g, '""')}"`
                    ).join(','))
                    ].join('\n');

                    // Download the CSV
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.setAttribute('href', url);
                    link.setAttribute('download', `aux_data_${username}_${new Date(startDateTime).toISOString().split('T')[0]}_to_${new Date(endDateTime).toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    showCustomAlert('Data downloaded successfully!');
                } else {
                    showCustomAlert('No data found for the selected date range');
                }

            } finally {
                if (document.body.contains(loadingIndicator)) {
                    document.body.removeChild(loadingIndicator);
                }
            }

        } catch (error) {
            console.error('Error in importFromAws:', error);
            showCustomAlert('Failed to import data: ' + error.message);

            const loadingIndicator = document.querySelector('.loading-indicator');
            if (loadingIndicator && document.body.contains(loadingIndicator)) {
                document.body.removeChild(loadingIndicator);
            }
        }
    }


    // Add error handling for AWS SDK and Cognito SDK loading
    window.addEventListener('error', function(event) {
        if (event.target.tagName === 'SCRIPT') {
            console.error('Failed to load script:', event.target.src);
            showCustomAlert('Failed to load required dependencies. Please try again.');
        }
    });

    async function processAuraNPTRow(columns, username, startDateTime, endDateTime) {
        try {
            // Parse date and check if it's within range
            const rowDate = parseDate(columns[0]);
            if (!rowDate || isNaN(rowDate.getTime())) {
                console.log('Invalid date:', columns[0]);
                return null;
            }

            const rowTimestamp = rowDate.getTime();
            if (rowTimestamp < startDateTime || rowTimestamp > endDateTime) {
                return null;
            }

            // Check username match
            if (columns[2] !== username) {
                return null;
            }

            // Load site mapping
            const siteMap = await loadMSSitesData();
            const userSite = siteMap[username] || 'Unknown';

            // Create processed row object
            return {
                Date: formatDate(rowDate),
                'Week No': getWeekNumber(rowDate),
                Username: columns[2],
                'Aux Label 1': columns[3] || 'N/A',
                'Aux Label 2': columns[4] || 'N/A',
                'Aux Label 3': columns[5] || 'N/A',
                'Time (minutes)': processTimeSpent(columns[6]),
                'Time (hours)': convertToHours(columns[6]),
                'Project Title': columns[8] || '',
                'Related Audits': columns[9] || '',
                'Are You the PL?': columns[10] || '',
                Comment: columns[11] || '',
                Site: userSite
            };
        } catch (error) {
            console.error('Error processing Aura NPT row:', error);
            return null;
        }
    }

    async function processAuxDataRow(columns, username, startDateTime, endDateTime) {
        try {
            // Parse date and check if it's within range
            const rowDate = parseDate(columns[0]);
            if (!rowDate || isNaN(rowDate.getTime())) {
                console.log('Invalid date:', columns[0]);
                return null;
            }

            const rowTimestamp = rowDate.getTime();
            if (rowTimestamp < startDateTime || rowTimestamp > endDateTime) {
                return null;
            }

            // Check username match
            if (columns[1] !== username) {
                return null;
            }

            // Load site mapping
            const siteMap = await loadMSSitesData();
            const userSite = siteMap[username] || 'Unknown';

            // Split AUX Label into three parts
            const auxLabels = splitAuxLabels(columns[2]);

            // Create processed row object
            return {
                Date: formatDate(rowDate),
                'Week No': getWeekNumber(rowDate),
                Username: columns[1],
                'Aux Label 1': auxLabels.label1,
                'Aux Label 2': auxLabels.label2,
                'Aux Label 3': auxLabels.label3,
                'Time (minutes)': processTimeSpent(columns[3]),
                'Time (hours)': convertToHours(columns[3]),
                'Project Title': columns[4] || '',
                'Related Audits': columns[5] || '',
                'Are You the PL?': columns[6] || '',
                Comment: columns[7] || '',
                Site: userSite
            };
        } catch (error) {
            console.error('Error processing aux_data row:', error);
            return null;
        }
    }

    function parseDate(dateString) {
        // Try different date formats
        const formats = [
            // M/D/YYYY
            (str) => {
                const [month, day, year] = str.split('/').map(Number);
                return new Date(year, month - 1, day);
            },
            // YYYY-MM-DD
            (str) => new Date(str),
            // MM-DD-YYYY
            (str) => {
                const [month, day, year] = str.split('-').map(Number);
                return new Date(year, month - 1, day);
            }
        ];

        for (const format of formats) {
            try {
                const date = format(dateString);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            } catch (e) {
                continue;
            }
        }

        console.error(`Failed to parse date: ${dateString}`);
        return null;
    }

    // Helper function to process time spent
    function processTimeSpent(timeSpent) {
        if (!timeSpent) return '00:00:00';

        try {
            // If already in HH:MM:SS format
            if (timeSpent.includes(':')) {
                return timeSpent;
            }

            // If it's a number (assuming minutes)
            const minutes = parseFloat(timeSpent);
            if (!isNaN(minutes)) {
                const hours = Math.floor(minutes / 60);
                const mins = Math.floor(minutes % 60);
                const secs = Math.floor((minutes * 60) % 60);
                return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }

            return '00:00:00';
        } catch (error) {
            console.error('Error processing time:', error);
            return '00:00:00';
        }
    }

    // Helper function to convert time to hours
    function convertToHours(timeString) {
        if (!timeString) return '0';

        try {
            if (timeString.includes(':')) {
                const [hours, minutes, seconds] = timeString.split(':').map(Number);
                return ((hours + (minutes / 60) + (seconds / 3600))).toFixed(2);
            }

            const minutes = parseFloat(timeString);
            if (!isNaN(minutes)) {
                return (minutes / 60).toFixed(2);
            }

            return '0';
        } catch (error) {
            console.error('Error converting time to hours:', error);
            return '0';
        }
    }

    // Helper function to split AUX labels
    function splitAuxLabels(auxLabel) {
        if (!auxLabel) {
            return {
                label1: 'N/A',
                label2: 'N/A',
                label3: 'N/A'
            };
        }

        const labels = auxLabel.split(' - ').map(label => label.trim());
        return {
            label1: labels[0] || 'N/A',
            label2: labels[1] || 'N/A',
            label3: labels[2] || 'N/A'
        };
    }

    // Helper function to format date
    function formatDate(date) {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    }

    // Helper function to download CSV
    function downloadCSV(data, startDateTime, endDateTime, username) {
        // Create CSV headers
        const headers = [
            'Date',
            'Week No',
            'Username',
            'Aux Label 1',
            'Aux Label 2',
            'Aux Label 3',
            'Time (minutes)',
            'Time (hours)',
            'Project Title',
            'Related Audits',
            'Are You the PL?',
            'Comment',
            'Site'
        ].join(',');

        // Convert data to CSV rows
        const csvRows = data.map(row => [
            row.Date,
            row['Week No'],
            row.Username,
            `"${row['Aux Label 1']}"`,
            `"${row['Aux Label 2']}"`,
            `"${row['Aux Label 3']}"`,
            row['Time (minutes)'],
            row['Time (hours)'],
            `"${row['Project Title'] || ''}"`,
            `"${row['Related Audits'] || ''}"`,
            `"${row['Are You the PL?'] || ''}"`,
            `"${row.Comment || ''}"`,
            row.Site
        ].join(','));

        // Combine headers and rows
        const csvContent = `${headers}\n${csvRows.join('\n')}`;

        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        // Format date for filename
        const startDate = new Date(startDateTime).toISOString().split('T')[0];
        const endDate = new Date(endDateTime).toISOString().split('T')[0];
        link.download = `${username}_NPT_data_${startDate}_to_${endDate}.csv`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }

    // Helper function to get week number
    function getWeekNumber(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
        const yearStart = new Date(d.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return weekNo;
    }

    // Helper function to escape CSV values
    function escapeCSVValue(value) {
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    }

    // Helper function to clean data
    function cleanData(value) {
        if (!value) return '';
        return value.toString().trim().replace(/[\r\n"]/g, ' ').replace(/,/g, ';');
    }

    function createLoadingIndicator() {
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-text">Please wait...</div>
    `;

        const style = document.createElement('style');
        style.textContent = `
        .loading-indicator {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            padding: 20px;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            align-items: center;
            z-index: 10000;
        }

        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 10px;
        }

        .loading-text {
            color: white;
            font-size: 14px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
        document.head.appendChild(style);

        return loadingIndicator;
    }

    function createAuthModal() {
        const modal = document.createElement('div');
        modal.innerHTML = `
        <div class="auth-modal">
            <div class="auth-modal-content">
                <h2 class="auth-modal-title">Authentication Required</h2>
                <div class="auth-input-container">
                    <input type="text"
                        id="username"
                        class="auth-input"
                        placeholder="Enter your login"
                        autocomplete="off">
                </div>
                <div class="auth-input-container">
                    <input type="password"
                        id="password"
                        class="auth-input"
                        placeholder="Enter your password">
                    <button id="toggle-password" class="toggle-password-btn">
                        <svg viewBox="0 0 24 24" class="eye-icon">
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                        </svg>
                    </button>
                </div>
                <div class="auth-button-container">
                    <button id="auth-submit" class="auth-submit-btn">Submit</button>
                    <button id="auth-cancel" class="auth-cancel-btn">Cancel</button>
                </div>
            </div>
        </div>
    `;

        modal.querySelector('#toggle-password').addEventListener('click', () => {
            const passwordField = modal.querySelector('#password');
            const eyeIcon = modal.querySelector('.eye-icon');

            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                eyeIcon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';
            } else {
                passwordField.type = 'password';
                eyeIcon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
            }
        });

        return modal;
    }
    ///////////////////////////////////////////////////////////////
    // Function to generate daily unique IDs for users
    async function generateDailyUniqueId() {
        try {
            const username = localStorage.getItem("currentUsername");
            const today = new Date().toISOString().split('T')[0];
            const s3 = new AWS.S3();

            // First, check if an ID already exists for today
            try {
                const existingRecord = await s3.getObject({
                    Bucket: 'real-time-databucket',
                    Key: `unique-ids/${username}/${today}.json`
            }).promise();

                const existingData = JSON.parse(existingRecord.Body.toString());

                // If we already have an ID for today, return it
                if (existingData.uniqueId) {
                    console.log('Retrieved existing unique ID for today');
                    return existingData.uniqueId;
                }
            } catch (error) {
                // If no record exists (NoSuchKey) or other error, continue to generate new ID
                if (error.code !== 'NoSuchKey') {
                    console.error('Error checking existing ID:', error);
                }
            }

            // Only generate new ID if one doesn't exist
            const uniqueId = `NPT-${today}-${username}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

            const idRecord = {
                username: username,
                date: today,
                uniqueId: uniqueId,
                status: 'not verified',
                generatedAt: new Date().toISOString()
            };

            // Store in AWS
            await s3.putObject({
                Bucket: 'real-time-databucket',
                Key: `unique-ids/${username}/${today}.json`,
                Body: JSON.stringify(idRecord),
                ContentType: 'application/json'
            }).promise();

            console.log('Generated new unique ID');
            return uniqueId;
        } catch (error) {
            console.error('Error in generateDailyUniqueId:', error);
            throw error;
        }
    }

    // Generate deterministic ID based on username and date
    async function generateDeterministicId(username, date) {
        const baseString = `${username}-${date}-NPT`;

        // Create a deterministic but secure hash
        const encoder = new TextEncoder();
        const data = encoder.encode(baseString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));

        // Convert to readable format
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Create a shorter, readable ID
        return `NPT-${hashHex.slice(0, 6)}-${date.split('-')[2]}`;
    }

    // Function to get or generate unique ID
    async function getOrGenerateUniqueId() {
        try {
            const s3 = new AWS.S3();
            const username = localStorage.getItem("currentUsername");
            const today = new Date().toISOString().split('T')[0];

            // Try to get existing ID
            try {
                const existingId = await s3.getObject({
                    Bucket: 'real-time-databucket',
                    Key: `unique-ids/${username}/${today}.json`
            }).promise();

                const idRecord = JSON.parse(existingId.Body.toString());

                // If ID exists and unused, return it
                if (idRecord.status === 'unused') {
                    return idRecord.uniqueId;
                }
            } catch (error) {
                if (error.code !== 'NoSuchKey') {
                    throw error;
                }
            }

            // If no valid ID exists, generate new one
            return generateDailyUniqueId();
        } catch (error) {
            console.error('Error getting unique ID:', error);
            throw error;
        }
    }

    // Function to mark ID as used
    async function markIdAsUsed(uniqueId) {
        try {
            const s3 = new AWS.S3();
            const username = localStorage.getItem("currentUsername");
            const today = new Date().toISOString().split('T')[0];

            const idRecord = {
                username: username,
                date: today,
                uniqueId: uniqueId,
                status: 'used',
                usedAt: new Date().toISOString()
            };

            await s3.putObject({
                Bucket: 'real-time-databucket',
                Key: `unique-ids/${username}/${today}.json`,
                Body: JSON.stringify(idRecord),
                ContentType: 'application/json'
            }).promise();

        } catch (error) {
            console.error('Error marking ID as used:', error);
            throw error;
        }
    }

    async function verifyExportFile(filename) {
        try {
            // Extract information from filename
            const match = filename.match(/aux_data_(.+)_(\d{4}-\d{2}-\d{2})_(.+)\.csv/);
            if (!match) {
                return { valid: false, reason: 'Invalid filename format' };
            }

            const [_, username, date, providedId] = match;

            // Get the record for this user and date
            const s3 = new AWS.S3();
            try {
                const record = await s3.getObject({
                    Bucket: 'real-time-databucket',
                    Key: `unique-ids/${username}/${date}.json`
            }).promise();

                const idRecord = JSON.parse(record.Body.toString());

                // Verify the ID matches and was used
                if (idRecord.uniqueId !== providedId) {
                    return {
                        valid: false,
                        reason: 'Invalid unique ID for this user and date'
                    };
                }

                if (idRecord.status !== 'used') {
                    return {
                        valid: false,
                        reason: 'Export ID exists but was never used'
                    };
                }

                return {
                    valid: true,
                    exportTime: idRecord.usedAt
                };

            } catch (error) {
                if (error.code === 'NoSuchKey') {
                    return {
                        valid: false,
                        reason: 'No export record found for this date'
                    };
                }
                throw error;
            }
        } catch (error) {
            console.error('Error verifying export file:', error);
            throw error;
        }
    }

    // Add verification to export history dashboard
    function addVerificationToHistory() {
        const verifyButton = document.createElement('button');
        verifyButton.textContent = 'Verify File';
        verifyButton.onclick = async () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.csv';

            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const result = await verifyExportFile(file.name);
                    if (result.valid) {
                        showCustomAlert(`Valid export file! Exported on: ${new Date(result.exportTime).toLocaleString()}`);
                    } else {
                        showCustomAlert(`Invalid export file: ${result.reason}`);
                    }
                }
            };

            fileInput.click();
        };

        // Add to your export history dashboard
        document.querySelector('.dashboard-actions').appendChild(verifyButton);
    }

    //Function to record NPT Export history
    async function recordAWSExport() {
        try {
            await loadAwsSdk();
            await loadCognitoSdk();

            const token = await AuthService.ensureAuthenticated();
            await configureAWS(token);

            const s3 = new AWS.S3();
            const username = localStorage.getItem("currentUsername");
            const timestamp = new Date().toISOString();
            const today = timestamp.split('T')[0];

            // First, check for existing unique ID in AWS
            let uniqueId;
            try {
                const existingRecord = await s3.getObject({
                    Bucket: 'real-time-databucket',
                    Key: `unique-ids/${username}/${today}.json`
            }).promise();

                const existingData = JSON.parse(existingRecord.Body.toString());
                uniqueId = existingData.uniqueId;

            } catch (error) {
                if (error.code === 'NoSuchKey') {
                    // If no ID exists, generate one using generateDailyUniqueId
                    uniqueId = await generateDailyUniqueId();
                } else {
                    throw error;
                }
            }

            if (!uniqueId) {
                throw new Error('Failed to get or generate unique ID');
            }

            // Update the unique ID record to mark it as verified
            const updatedIdRecord = {
                username: username,
                date: today,
                uniqueId: uniqueId,
                status: 'verified',
                verifiedAt: timestamp,
                exportTimestamp: timestamp
            };

            // Update the unique ID record
            await s3.putObject({
                Bucket: 'real-time-databucket',
                Key: `unique-ids/${username}/${today}.json`,
                Body: JSON.stringify(updatedIdRecord),
                ContentType: 'application/json'
            }).promise();

            // Record the export event
            const exportRecord = {
                username: username,
                timestamp: timestamp,
                exportType: 'NPT Data',
                status: true,
                uniqueId: uniqueId,
                lastModified: timestamp
            };

            // Store the export record
            await s3.putObject({
                Bucket: 'real-time-databucket',
                Key: `export-logs/${username}/${timestamp}.json`,
                Body: JSON.stringify(exportRecord),
                ContentType: 'application/json'
            }).promise();

            // Store current export details in localStorage
            localStorage.setItem('lastExportDetails', JSON.stringify({
                timestamp: timestamp,
                uniqueId: uniqueId
            }));

            // Also ensure the unique ID is stored in localStorage
            localStorage.setItem('dailyUniqueId', uniqueId);

            console.log('Export recorded successfully:', {
                username: username,
                timestamp: timestamp,
                uniqueId: uniqueId,
                status: 'verified'
            });

            return uniqueId;

        } catch (error) {
            console.error('Error recording export:', error);

            // Handle failed export
            try {
                const failureTimestamp = new Date().toISOString();
                const failedExportRecord = {
                    username: localStorage.getItem("currentUsername"),
                    timestamp: failureTimestamp,
                    exportType: 'NPT Data',
                    status: false,
                    error: error.message,
                    uniqueId: localStorage.getItem('dailyUniqueId') || null
                };

                const s3 = new AWS.S3();
                await s3.putObject({
                    Bucket: 'real-time-databucket',
                    Key: `export-logs/failed/${failureTimestamp}.json`,
                    Body: JSON.stringify(failedExportRecord),
                    ContentType: 'application/json'
                }).promise();

            } catch (recordError) {
                console.error('Error recording failed export:', recordError);
            }

            throw error; // Re-throw the error for handling by the caller
        }
    }

    async function showExportHistory() {
        try {
            await loadAwsSdk();
            await loadCognitoSdk();

            const token = await AuthService.ensureAuthenticated();
            await configureAWS(token);

            // Create modal container
            const modal = document.createElement('div');
            modal.className = 'export-history-modal';
            modal.innerHTML = `
    <div class="modal-content">
        <header class="modal-header">
            <h2>NPT Export History</h2>
            <div class="filter-container">
                <div class="date-filters">
                    <input type="date" id="startDate" class="date-input">
                    <span class="date-separator">to</span>
                    <input type="date" id="endDate" class="date-input">
                </div>
                <div class="search-container">
                    <input type="text" id="exportSearchInput" placeholder="Search by username...">
                </div>
            </div>
            <button class="close-btn">×</button>
        </header>
        <div class="table-container">
            <table class="export-history-table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Export Date</th>
                        <th>Export Time</th>
                        <th>Unique ID</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="exportHistoryBody">
                    <tr>
                        <td colspan="5">Loading...</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
    `;

            // Add styles
            const styles = document.createElement('style');
            styles.textContent = `
            .export-history-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10004;
            }

            .modal-content {
                background: #1a1a1a;
                width: 90%;
                max-width: 1000px;
                max-height: 80vh;
                border-radius: 12px;
                padding: 20px;
                color: white;
                box-shadow: 0 5px 15px rgba(0,0,0,0.5);
            }

            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }

            .search-container {
                flex: 1;
                margin: 0 20px;
            }

            #exportSearchInput {
                width: 100%;
                padding: 8px 12px;
                border: none;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.1);
                color: white;
            }

            .table-container {
                max-height: calc(80vh - 100px);
                overflow-y: auto;
            }

            .export-history-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
            }

            .export-history-table th,
            .export-history-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .export-history-table th {
                background: rgba(255, 255, 255, 0.05);
                font-weight: bold;
            }

            .export-history-table tr:hover {
                background: rgba(255, 255, 255, 0.05);
            }

            .close-btn {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .close-btn:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .status-success {
                color: #4CAF50;
            }

            .status-failed {
                color: #f44336;
            }

    .filter-container {
        flex: 1;
        display: flex;
        gap: 20px;
        align-items: center;
        margin: 0 20px;
    }

    .date-filters {
        display: flex;
        align-items: center;
        gap: 10px;
        background: rgba(255, 255, 255, 0.05);
        padding: 5px 10px;
        border-radius: 6px;
    }

.date-input {
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    background: #1a1a1a; // Changed this from rgba(255, 255, 255, 0.1)
    color: white;
    font-size: 14px;
    cursor: pointer;
    outline: none;
    transition: border-color 0.3s ease;
}

.date-input:hover {
    border-color: rgba(255, 255, 255, 0.3);
}

.date-input:focus {
    border-color: #4CAF50;
    box-shadow: 0 0 0 1px rgba(76, 175, 80, 0.2);
}

.date-input::-webkit-calendar-picker-indicator {
    filter: invert(1);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.3s ease;
}

.date-input::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
}

    .date-separator {
        color: rgba(255, 255, 255, 0.6);
    }

    .search-container {
        flex: 1;
    }
        `;
            document.head.appendChild(styles);
            document.body.appendChild(modal);

            // Load export history
            const s3 = new AWS.S3();
            const response = await s3.listObjects({
                Bucket: 'real-time-databucket',
                Prefix: 'export-logs/'
            }).promise();

            const exports = await Promise.all(response.Contents.map(async (item) => {
                try {
                    const data = await s3.getObject({
                        Bucket: 'real-time-databucket',
                        Key: item.Key
                    }).promise();
                    return JSON.parse(data.Body.toString());
                } catch (error) {
                    console.error('Error fetching export record:', error);
                    return null;
                }
            }));

            // Filter out null values and sort by timestamp
            const validExports = exports
            .filter(exp => exp !== null && exp.username) // Add validation here
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));


            // Update table with data
            function updateTable(searchTerm = '') {
                const tbody = document.getElementById('exportHistoryBody');
                const startDate = document.getElementById('startDate').value;
                const endDate = document.getElementById('endDate').value;

                const filteredExports = validExports.filter(exp => {
                    // Add null check for exp and exp.username
                    if (!exp || !exp.username) return false;

                    const exportDate = new Date(exp.timestamp);
                    const meetsDateCriteria = (!startDate || exportDate >= new Date(startDate)) &&
                          (!endDate || exportDate <= new Date(endDate + 'T23:59:59'));
                    const meetsSearchCriteria = exp.username.toLowerCase().includes(searchTerm.toLowerCase());

                    return meetsDateCriteria && meetsSearchCriteria;
                });


                tbody.innerHTML = filteredExports.map(exp => {
                    const date = new Date(exp.timestamp);

                    // Verify if this ID matches the pre-generated ID for this user and date
                    const isPreGeneratedId = verifyPreGeneratedId(exp.username, date.toISOString().split('T')[0], exp.uniqueId);

                    // Add verification status to the display
                    const verificationStatus = isPreGeneratedId ?
                          '<span class="verification-badge verified" title="Verified Pre-generated ID">✓</span>' :
                    '<span class="verification-badge unverified" title="Unverified ID">?</span>';

                    return `
            <tr>
                <td>${exp.username}</td>
                <td>${date.toLocaleDateString()}</td>
                <td>${date.toLocaleTimeString()}</td>
                <td>
                    <div class="id-container">
                        <span class="unique-id ${isPreGeneratedId ? 'verified' : 'unverified'}"
                              title="Click to copy"
                              onclick="copyToClipboard('${exp.uniqueId}')">
                            ${exp.uniqueId}
                        </span>
                        ${verificationStatus}
                    </div>
                </td>
                <td class="status-${exp.status ? 'success' : 'failed'}">
                    ${exp.status ? 'Success' : 'Failed'}
                </td>
            </tr>
        `;
                }).join('') || '<tr><td colspan="5">No records found</td></tr>';

                // Add styles for verification badges
                if (!document.getElementById('verification-styles')) {
                    const styles = document.createElement('style');
                    styles.id = 'verification-styles';
                    styles.textContent = `
            .id-container {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .unique-id {
                padding: 4px 8px;
                border-radius: 4px;
                transition: all 0.3s ease;
            }

            .unique-id.verified {
                background: rgba(76, 175, 80, 0.1);
                border: 1px solid rgba(76, 175, 80, 0.2);
            }

            .unique-id.unverified {
                background: rgba(255, 152, 0, 0.1);
                border: 1px solid rgba(255, 152, 0, 0.2);
            }


            .verification-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                font-size: 12px;
                font-weight: bold;
            }

            .verification-badge.verified {
                background: rgba(76, 175, 80, 0.1);
                color: #4CAF50;
                border: 1px solid rgba(76, 175, 80, 0.2);
            }

            .verification-badge.unverified {
                background: rgba(255, 152, 0, 0.1);
                color: #FF9800;
                border: 1px solid rgba(255, 152, 0, 0.2);
            }
        `;
                    document.head.appendChild(styles);
                }
            }

            // Helper function to verify if an ID matches the pre-generated one
            async function verifyPreGeneratedId(username, date, providedId) {
                try {
                    const s3 = new AWS.S3();
                    const response = await s3.getObject({
                        Bucket: 'real-time-databucket',
                        Key: `unique-ids/${username}/${date}.json`
        }).promise();

                    const record = JSON.parse(response.Body.toString());
                    return record.uniqueId === providedId;
                } catch (error) {
                    console.error('Error verifying pre-generated ID:', error);
                    return false;
                }
            }

            // Keep existing copyToClipboard function
            window.copyToClipboard = function(text) {
                navigator.clipboard.writeText(text).then(() => {
                    showCustomAlert('Unique ID copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy:', err);
                    showCustomAlert('Failed to copy ID');
                });
            };
            // Initial table population
            updateTable();

            // Add event listeners
            const searchInput = document.getElementById('exportSearchInput');
            searchInput.addEventListener('input', (e) => updateTable(e.target.value));

            // Add these after your existing event listeners
            const startDate = document.getElementById('startDate');
            const endDate = document.getElementById('endDate');

            // Set default date range (last 30 days)
            const today = new Date();
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(today.getDate() - 30);

            startDate.value = thirtyDaysAgo.toISOString().split('T')[0];
            endDate.value = today.toISOString().split('T')[0];

            // Add event listeners for date inputs
            startDate.addEventListener('change', () => updateTable(searchInput.value));
            endDate.addEventListener('change', () => updateTable(searchInput.value));

            // Add maximum date restriction
            startDate.max = today.toISOString().split('T')[0];
            endDate.max = today.toISOString().split('T')[0];

            // Ensure end date is not before start date
            startDate.addEventListener('change', () => {
                if (endDate.value && startDate.value > endDate.value) {
                    endDate.value = startDate.value;
                }
                endDate.min = startDate.value;
            });

            endDate.addEventListener('change', () => {
                if (startDate.value && endDate.value < startDate.value) {
                    startDate.value = endDate.value;
                }
                startDate.max = endDate.value;
            });

            // Add additional styles for unique ID
            const additionalStyles = `
            .unique-id {
                cursor: pointer;
                padding: 4px 8px;
                background: rgba(108, 92, 231, 0.1);
                border-radius: 4px;
                transition: all 0.3s ease;
            }

            .unique-id:hover {
                background: rgba(108, 92, 231, 0.2);
            }

            .unique-id::after {
                content: '📋';
                margin-left: 6px;
                font-size: 12px;
                opacity: 0.7;
            }
        `;
            const styleSheet = document.createElement('style');
            styleSheet.textContent = additionalStyles;
            document.head.appendChild(styleSheet);

            modal.querySelector('.close-btn').addEventListener('click', () => {
                document.body.removeChild(modal);
                document.head.removeChild(styleSheet);
            });

        } catch (error) {
            console.error('Error showing export history:', error);
            showCustomAlert('Failed to load export history');
        }
    }
    /////////////////////////////////////////////////////
    async function searchProjectTime() {
        try {
            await injectAuthStyles();
            await loadAwsSdk();
            await loadCognitoSdk();

            // Authentication
            const token = await AuthService.ensureAuthenticated();
            if (!token) {
                throw new Error('Authentication failed');
            }
            await configureAWS(token);

            // Styles
            const searchStyles = document.createElement('style');
            searchStyles.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wg:wght@500;600;700&display=swap');

            .search-container {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0);
                z-index: 10001;
                background: rgba(15, 15, 20, 0.92);
                padding: 35px;
                border-radius: 20px;
                width: 420px;
                color: #e0e0e0;
                font-family: 'Inter', sans-serif;
                backdrop-filter: blur(24px);
                border: 1px solid rgba(255, 255, 255, 0.05);
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
                animation: popupIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }

            .search-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
            }

            .search-title {
                font-size: 22px;
                font-weight: 600;
                color: #ffffff;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .search-close {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.5);
                font-size: 22px;
                cursor: pointer;
                padding: 6px;
                border-radius: 50%;
                transition: background 0.2s ease;
            }

            .search-close:hover {
                background: rgba(255, 255, 255, 0.08);
                color: white;
            }

            .search-type-container {
                margin-bottom: 20px;
            }

            .search-type-label {
                display: block;
                margin-bottom: 10px;
                color: white;
                font-weight: 500;
            }

            .search-type-options {
                display: flex;
                gap: 15px;
            }

            .search-type-option {
                flex: 1;
                padding: 12px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 10px;
                color: white;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .search-type-option.selected {
                background: rgba(108, 92, 231, 0.2);
                border-color: #6c5ce7;
            }

            .search-type-option:hover {
                background: rgba(255, 255, 255, 0.15);
            }

            .search-input {
                width: 100%;
                padding: 14px 18px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                font-size: 14px;
                color: #ffffff;
                margin-bottom: 20px;
                transition: 0.2s border, 0.2s background;
            }

            .search-input::placeholder {
                color: rgba(255, 255, 255, 0.3);
            }

            .search-input:focus {
                outline: none;
                background: rgba(255, 255, 255, 0.06);
                border-color: #6c7bff;
                box-shadow: 0 0 0 3px rgba(108, 123, 255, 0.1);
            }

            .search-button {
                width: 100%;
                padding: 14px;
                background: linear-gradient(135deg, #5865f2, #818cf8);
                border: none;
                border-radius: 12px;
                font-size: 15px;
                font-weight: 600;
                color: white;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 6px 18px rgba(88, 101, 242, 0.25);
            }

            .search-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(88, 101, 242, 0.35);
            }

            .search-button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }

            .total-time {
                font-size: 28px;
                font-weight: 600;
                margin: 24px 0;
                text-align: center;
                color: #c3cfff;
                background-color: rgba(77, 94, 255, 0.05);
                border: 1px solid rgba(77, 94, 255, 0.1);
                border-radius: 14px;
                padding: 16px;
                line-height: 1.5;
            }

            .loading-spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 50%;
                border-top-color: white;
                animation: spin 0.8s linear infinite;
                margin-right: 10px;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            @keyframes popupIn {
                0% {
                    opacity: 0;
                    transform: translate(-50%, -50%) scale(0.95);
                }
                100% {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }
            }

            @media (max-width: 480px) {
                .search-container {
                    width: 90%;
                    padding: 25px;
                }
            }
        `;
            document.head.appendChild(searchStyles);

            // Create container
            const searchContainer = document.createElement('div');
            searchContainer.className = 'search-container';
            searchContainer.innerHTML = `
            <div class="search-header">
                <div class="search-title">Search Project Time</div>
                <button class="search-close">&times;</button>
            </div>

            <div class="search-type-container">
                <label class="search-type-label">Search Type:</label>
                <div class="search-type-options">
                    <div class="search-type-option selected" data-type="my">My Project Time</div>
                    <div class="search-type-option" data-type="total">Total Project Time</div>
                </div>
            </div>

            <input type="text" class="search-input" placeholder="Enter Project Title/Number">
            <button class="search-button">Search</button>
            <div class="search-results"></div>
        `;
            document.body.appendChild(searchContainer);

            // Initialize variables and event listeners
            let selectedSearchType = 'my';
            const searchTypeOptions = searchContainer.querySelectorAll('.search-type-option');
            const searchBtn = searchContainer.querySelector('.search-button');
            const searchInput = searchContainer.querySelector('.search-input');
            const resultsDiv = searchContainer.querySelector('.search-results');
            const closeBtn = searchContainer.querySelector('.search-close');

            // Event Listeners
            searchTypeOptions.forEach(option => {
                option.addEventListener('click', () => {
                    searchTypeOptions.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                    selectedSearchType = option.dataset.type;
                    console.log("Search type selected:", selectedSearchType);
                });
            });

            closeBtn.onclick = () => document.body.removeChild(searchContainer);

            // Search Button Click Handler
            searchBtn.onclick = async () => {
                const projectNumber = searchInput.value.trim();
                if (!projectNumber) {
                    showCustomAlert('Please enter a project number');
                    return;
                }

                try {
                    searchBtn.textContent = 'Searching...';
                    searchBtn.disabled = true;

                    const s3 = new AWS.S3();
                    const bucketName = 'aux-data-bucket';
                    const prefixes = ['Aura_NPT_', 'aux_data_'];
                    const currentUsername = localStorage.getItem("currentUsername");

                    console.log("Current username:", currentUsername);
                    console.log("Search type:", selectedSearchType);

                    let conductTime = 0;
                    let nonConductTime = 0;
                    let matchedEntries = 0;

                    for (const prefix of prefixes) {
                        const listedObjects = await s3.listObjectsV2({
                            Bucket: bucketName,
                            Prefix: prefix
                        }).promise();

                        for (const item of listedObjects.Contents) {
                            const fileData = await s3.getObject({
                                Bucket: bucketName,
                                Key: item.Key
                            }).promise();

                            const fileContent = fileData.Body.toString('utf-8');
                            const rows = fileContent.split('\n');

                            // Process each row
                            for (let i = 1; i < rows.length; i++) {
                                const row = rows[i].trim().split(',');
                                if (row.length < 9) continue;

                                const username = row[2];
                                const projectTitle = row[8];
                                const timeMinutes = parseFloat(row[6]);
                                const auxLabel1 = row[3];
                                const auxLabel2 = row[4];
                                const auxLabel3 = row[5];

                                // Skip if project number doesn't match
                                if (!projectTitle || !projectTitle.trim().includes(projectNumber)) continue;

                                // Check if entry should be counted based on search type
                                const shouldCount = selectedSearchType === 'total' ||
                                      (selectedSearchType === 'my' &&
                                       username.toLowerCase() === currentUsername.toLowerCase());

                                // Replace the time categorization part with this:

                                if (shouldCount) {
                                    matchedEntries++;
                                    console.log("Processing entry:", {
                                        username,
                                        projectTitle,
                                        timeMinutes,
                                        auxLabel1,
                                        auxLabel2,
                                        auxLabel3
                                    });

                                    // Check labels in reverse order (more specific to less specific)
                                    let isNonConduct = false;

                                    // First check auxLabel3
                                    if (auxLabel3 && auxLabel3.trim()) {
                                        const label3 = auxLabel3.trim().toLowerCase();
                                        if (label3.includes('non conduct')) {
                                            isNonConduct = true;
                                            nonConductTime += timeMinutes;
                                            console.log(`Added ${timeMinutes} to non-conduct time (Label3)`);
                                        } else if (label3.includes('conduct project')) {
                                            conductTime += timeMinutes;
                                            console.log(`Added ${timeMinutes} to conduct time (Label3)`);
                                        }
                                    }
                                    // If not found in auxLabel3, check auxLabel2
                                    else if (auxLabel2 && auxLabel2.trim()) {
                                        const label2 = auxLabel2.trim().toLowerCase();
                                        if (label2.includes('non conduct')) {
                                            isNonConduct = true;
                                            nonConductTime += timeMinutes;
                                            console.log(`Added ${timeMinutes} to non-conduct time (Label2)`);
                                        } else if (label2.includes('conduct project')) {
                                            conductTime += timeMinutes;
                                            console.log(`Added ${timeMinutes} to conduct time (Label2)`);
                                        }
                                    }
                                    // If still not found, check auxLabel1
                                    else if (auxLabel1 && auxLabel1.trim()) {
                                        const label1 = auxLabel1.trim().toLowerCase();
                                        if (label1.includes('non conduct')) {
                                            isNonConduct = true;
                                            nonConductTime += timeMinutes;
                                            console.log(`Added ${timeMinutes} to non-conduct time (Label1)`);
                                        } else if (label1.includes('conduct project')) {
                                            conductTime += timeMinutes;
                                            console.log(`Added ${timeMinutes} to conduct time (Label1)`);
                                        }
                                    }

                                    // If no conduct/non-conduct specification found in any label
                                    if (!auxLabel3 && !auxLabel2 && !auxLabel1) {
                                        nonConductTime += timeMinutes;
                                        console.log(`Added ${timeMinutes} to non-conduct time (default)`);
                                    }
                                }

                            }
                        }
                    }

                    console.log("Final calculations:", {
                        matchedEntries,
                        conductTime,
                        nonConductTime,
                        totalTime: conductTime + nonConductTime
                    });

                    // Format and display results
                    const formatTimeDisplay = (minutes) => {
                        const hours = Math.floor(minutes / 60);
                        const mins = Math.floor(minutes % 60);
                        const secs = Math.floor((minutes - Math.floor(minutes)) * 60);
                        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                    };

                    resultsDiv.innerHTML = `
            <div class="total-time">
                ${selectedSearchType === 'my' ? 'Your' : 'Total'} Time for "${projectNumber}"<br>
                Conduct Time: ${formatTimeDisplay(conductTime)}<br>
                Non-Conduct Time: ${formatTimeDisplay(nonConductTime)}<br>
                Total Time: ${formatTimeDisplay(conductTime + nonConductTime)}
            </div>
        `;

                } catch (error) {
                    console.error('Search error:', error);
                    showCustomAlert('Error searching project data: ' + error.message);
                } finally {
                    searchBtn.textContent = 'Search';
                    searchBtn.disabled = false;
                }
            };
        } catch (error) {
            console.error('Error in searchProjectTime:', error);
            showCustomAlert('Failed to initialize search: ' + error.message);
        }
    }
    ///////////////////////////////////////////////////////////////
    function displayUsername() {
        console.log("Attempting to display username...");

        // Try multiple methods to get username
        function getUsernameFromSources() {
            // Method 1: Try to get from window.paragonAppConfig
            if (window.paragonAppConfig && window.paragonAppConfig.agentLogin) {
                console.log("Username found in paragonAppConfig");
                return window.paragonAppConfig.agentLogin;
            }

            // Method 2: Try to get from the nav item
            const navItem = document.querySelector('.navItem_uVQqW.small_UO3a7');
            if (navItem) {
                const userText = navItem.textContent;
                const match = userText.match(/User:\s*(\S+)/);
                if (match && match[1]) {
                    console.log("Username found in nav item");
                    return match[1];
                }
            }

            // If no username found, return null
            return null;
        }

        function tryDisplay() {
            const username = getUsernameFromSources();

            if (username) {
                setupUsername(username);
            } else {
                console.error("Failed to extract username from all available sources");
                const usernameDisplay = document.getElementById("username-display") || createUsernameDisplay();
                usernameDisplay.textContent = "Unable to load username.";
                usernameDisplay.style.color = "red";
            }
        }

        function setupUsername(username) {
            let usernameDisplay = document.getElementById("username-display");
            if (!usernameDisplay) {
                usernameDisplay = createUsernameDisplay();
            }

            localStorage.setItem("currentUsername", username);

            const avatarContainer = document.createElement("div");
            avatarContainer.id = "avatar-container";
            avatarContainer.style.display = "flex";
            avatarContainer.style.alignItems = "center";

            const avatarLink = document.createElement("a");
            avatarLink.href = `https://phonetool.amazon.com/users/${username}`;
            avatarLink.target = "_blank";
            avatarLink.style.display = "inline-block";

            const avatarImage = document.createElement("img");
            const storedAvatar = localStorage.getItem("customAvatar") || `https://badgephotos.corp.amazon.com/?uid=${username}`;
            avatarImage.src = storedAvatar;
            avatarImage.alt = `${username}'s Avatar`;
            avatarImage.style.width = "50px";
            avatarImage.style.height = "50px";
            avatarImage.style.borderRadius = "50%";
            avatarImage.style.marginRight = "10px";
            avatarImage.style.cursor = "pointer";
            avatarImage.style.marginBottom = "10px";
            avatarLink.appendChild(avatarImage);

            const usernameTextNode = document.createElement("span");
            usernameTextNode.textContent = username;
            usernameTextNode.style.color = "white";

            avatarContainer.appendChild(avatarLink);
            avatarContainer.appendChild(usernameTextNode);
            usernameDisplay.innerHTML = "";
            usernameDisplay.appendChild(avatarContainer);
        }

        function createUsernameDisplay() {
            let usernameDisplay = document.getElementById("username-display");
            if (!usernameDisplay) {
                usernameDisplay = document.createElement("div");
                usernameDisplay.id = "username-display";
                const widget = document.getElementById("aux-widget");
                if (widget) {
                    widget.insertBefore(usernameDisplay, widget.firstChild);
                } else {
                    console.error("Widget not found. Cannot display username.");
                }
            }
            return usernameDisplay;
        }

        // Add a small delay to ensure the DOM elements are loaded
        setTimeout(tryDisplay, 1000);
    }

    document.addEventListener("DOMContentLoaded", () => {
        console.log("DOM fully loaded. Starting to display username...");
        displayUsername();
    });
    ///////////////////////////////////////////////////////////////
    // To get entire user data
    async function checkAuthorization(username) {
        try {
            const script = document.createElement('script');
            script.src = 'https://mofi-l.github.io/aux-auth-config/auth-config.js';

            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });

            const isAuthorized = window.AUTH_CONFIG.authorizedUsers.includes(username);

            document.head.removeChild(script);
            delete window.AUTH_CONFIG;

            return isAuthorized;
        } catch (error) {
            console.log('Authorization check failed:', error);
            return false;
        }
    }

    // Helper functions
    function getMonthName(date) {
        return new Date(date).toLocaleString('default', { month: 'long' });
    }

    function convertMinutesToHours(minutes) {
        return (parseFloat(minutes) / 60).toFixed(2);
    }

    function convertTimeToMinutes(timeValue) {
        if (!timeValue) return '0.00';

        if (/^\d{1,2}:\d{2}:\d{2}$/.test(timeValue)) {
            const [hours, minutes, seconds] = timeValue.split(':').map(Number);
            return ((hours * 60) + minutes + (seconds / 60)).toFixed(2);
        }

        const numericValue = parseFloat(timeValue);
        if (!numericValue || isNaN(numericValue)) {
            return '0.00';
        }

        return timeValue.includes('.') ? numericValue.toFixed(2) : (numericValue / 60).toFixed(2);
    }

    function handleEmptyValue(value) {
        if (value === null || value === undefined || value.toString().trim() === '') {
            return 'N/A';
        }
        return value;
    }

    Date.prototype.getWeek = function() {
        const onejan = new Date(this.getFullYear(), 0, 1);
        return Math.ceil((((this - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    };

    function splitAuxLabel(auxLabel) {
        if (!auxLabel || auxLabel.trim() === '') {
            return {
                'Aux L1': 'N/A',
                'Aux L2': 'N/A',
                'Aux L3': 'N/A'
            };
        }

        const parts = auxLabel.split(' - ');
        return {
            'Aux L1': parts[0] || 'N/A',
            'Aux L2': parts[1] || 'N/A',
            'Aux L3': parts[2] || 'N/A'
        };
    }

    function formatTimeSpent(timeValue) {
        if (!timeValue) return '00:00:00';

        if (/^\d{1,2}:\d{2}:\d{2}$/.test(timeValue)) {
            return timeValue;
        }

        const numericValue = parseFloat(timeValue);
        if (!isNaN(numericValue)) {
            const hours = Math.floor(numericValue / 60);
            const minutes = Math.floor(numericValue % 60);
            const seconds = Math.floor((numericValue * 60) % 60);

            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        return '00:00:00';
    }

    // Column definitions
    const AURA_NPT_COLUMNS = [
        'Date', 'Week No', 'Username', 'Aux Label 1', 'Aux Label 2', 'Aux Label 3',
        'Time (minutes)', 'Time (hours)', 'Project Title', 'Related Audits',
        'Are You the PL?', 'Comment', 'Site'
    ];

    const AUX_DATA_COLUMNS = [
        'Date', 'Username', 'AUX Label', 'Time Spent', 'Project Title',
        'Related Audits', 'Are You the PL?', 'Comment'
    ];

    // Helper function to load MS_Sites data
    async function loadMSSitesData() {
        const s3 = new AWS.S3();
        const bucketName = 'aux-data-bucket';
        const key = 'MS_sites.csv';

        try {
            const data = await s3.getObject({
                Bucket: bucketName,
                Key: key
            }).promise();

            const csvContent = data.Body.toString('utf-8');
            const rows = csvContent.split('\n').slice(1);
            const siteMap = {};

            rows.forEach(row => {
                if (!row.trim()) return;
                const [username, site] = row.split(',');
                if (username && site) {
                    siteMap[username.trim()] = site.trim();
                }
            });

            return siteMap;
        } catch (error) {
            console.log('Error loading MS_Sites data:', error);
            return {};
        }
    }

    const styles = document.createElement('style');
    styles.textContent = `
            .selection-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10005;
            }

            .modal-content {
                background: #1e1e1e;
                padding: 24px;
                border-radius: 12px;
                text-align: center;
                width: 280px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            }

            .modal-title {
                color: #ffffff;
                margin-bottom: 20px;
                font-size: 1.2rem;
                font-weight: 600;
            }

            .selection-btn {
                display: block;
                width: 100%;
                margin: 10px 0;
                padding: 12px;
                border: none;
                border-radius: 6px;
                background: #2c2c2c;
                color: #ffffff;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 1rem;
            }

            .selection-btn:hover {
                background: #3a3a3a;
            }

            .selection-btn.cancel {
                background: #dc3545;
            }

            .selection-btn.cancel:hover {
                background: #c82333;
            }
        `;
    document.head.appendChild(styles);

    async function getFullData() {
        const currentUsername = localStorage.getItem("currentUsername");

        try {
            const isAuthorized = await checkAuthorization(currentUsername);
            if (!isAuthorized) {
                showCustomAlert("You don't have permission to download full data");
                return;
            }

            await injectAuthStyles();
            await loadAwsSdk();
            await loadCognitoSDK();

            const token = await AuthService.ensureAuthenticated();
            await configureAWS(token);

            AWS.config.update({
                region: 'eu-north-1',
                credentials: new AWS.CognitoIdentityCredentials({
                    IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                    Logins: {
                        'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                    }
                })
            });

            const loadingIndicator = createLoadingIndicator();
            document.body.appendChild(loadingIndicator);

            try {
                const s3 = new AWS.S3();
                const bucketName = 'aux-data-bucket';

                // Get the collated file content
                const collatedFileResponse = await s3.getObject({
                    Bucket: bucketName,
                    Key: 'Aura_NPT_Collated.csv'
                }).promise();

                // Remove any trailing newlines from collated content
                let collatedContent = collatedFileResponse.Body.toString('utf-8').trim();

                // Get aux_data_ files
                const auxDataResponse = await s3.listObjectsV2({
                    Bucket: bucketName,
                    Prefix: 'aux_data_'
                }).promise();

                // Process aux_data_ files
                let auxContent = [];
                for (const item of auxDataResponse.Contents) {
                    const fileData = await s3.getObject({
                        Bucket: bucketName,
                        Key: item.Key
                    }).promise();

                    const fileContent = fileData.Body.toString('utf-8');
                    const lines = fileContent.split('\n');

                    // Skip header row and filter out empty lines
                    if (lines.length > 1) {
                        const dataLines = lines.slice(1)
                        .map(line => line.trim())
                        .filter(line => line.length > 0);

                        if (dataLines.length > 0) {
                            auxContent.push(...dataLines);
                        }
                    }
                }

                // Combine contents with proper line breaks
                const combinedContent = auxContent.length > 0 ?
                      collatedContent + '\n' + auxContent.join('\n') :
                collatedContent;

                // Create and trigger download
                const blob = new Blob([combinedContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;

                // Format date for filename
                const today = new Date();
                const startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
                const endDate = today.toISOString().split('T')[0];
                link.download = `full_npt_data_${startDate}_to_${endDate}.csv`;

                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                showCustomAlert('Data successfully exported!');

            } finally {
                document.body.removeChild(loadingIndicator);
            }

        } catch (error) {
            console.error('Error in getFullData:', error);
            showCustomAlert('Failed to retrieve full data: ' + error.message);

            const loadingIndicator = document.querySelector('.loading-indicator');
            if (loadingIndicator && document.body.contains(loadingIndicator)) {
                document.body.removeChild(loadingIndicator);
            }
        }
    }



    // Helper function to parse CSV lines properly
    function parseCSVLine(line) {
        const result = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(field.trim());
                field = '';
            } else {
                field += char;
            }
        }

        result.push(field.trim());
        return result;
    }

    // Helper function to escape CSV fields
    function escapeCSVField(field) {
        if (field === null || field === undefined) {
            return '';
        }
        const stringField = String(field); // Convert to string explicitly
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
    }

    // Helper function to transform aux data rows
    function transformAuxDataRow(row, siteMap) {
        const fields = parseCSVLine(row);
        if (fields.length !== AUX_DATA_COLUMNS.length) return null;

        try {
            const rowData = {};
            AUX_DATA_COLUMNS.forEach((col, index) => {
                rowData[col] = fields[index];
            });

            const auxLabels = splitAuxLabel(rowData['AUX Label']);
            const timeInMinutes = convertTimeToMinutes(rowData['Time Spent']);
            const timeInHours = convertMinutesToHours(timeInMinutes);
            const weekNo = new Date(rowData['Date']).getWeek();
            const site = siteMap[rowData['Username']] || 'N/A';

            const transformedFields = [
                rowData['Date'],
                weekNo,
                rowData['Username'],
                auxLabels['Aux L1'],
                auxLabels['Aux L2'],
                auxLabels['Aux L3'],
                timeInMinutes,
                timeInHours,
                rowData['Project Title'],
                rowData['Related Audits'],
                validateAreYouPL(rowData['Are You the PL?']),
                rowData['Comment'],
                site
            ];

            return transformedFields.map(field => escapeCSVField(field)).join(',');

        } catch (error) {
            console.error('Error transforming row:', error, row);
            return null;
        }
    }
    ///////////////////////////////////////////////////////////////
    //CL Data Manager
    async function checkCLManagerAuthorization(username) {
        try {
            const script = document.createElement('script');
            // Update this URL to match your actual GitHub file location
            script.src = 'https://mofi-l.github.io/aux-auth-config/auth-CLmanager.js';

            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });

            // Add debug logging
            console.log('Auth Config:', window.CL_AUTH_CONFIG);
            console.log('Checking username:', username);
            console.log('Authorized users:', window.CL_AUTH_CONFIG.authorizedUsers);

            const isAuthorized = window.CL_AUTH_CONFIG.authorizedUsers.includes(username);
            console.log('Is authorized:', isAuthorized);

            document.head.removeChild(script);
            delete window.CL_AUTH_CONFIG;

            return isAuthorized;
        } catch (error) {
            console.error('CL Manager authorization check failed:', error);
            return false;
        }
    }

    function showCLDataManagerOptions() {
        const modal = document.createElement('div');
        modal.className = 'cl-data-manager-modal';
        modal.innerHTML = `
<div class="modal-content">
    <h2>CL Data Manager</h2>
    <div class="option-buttons">
        <button id="getProjectTimeBtn">
            Get Project Time
        </button>
        <button id="showDashboardBtn">
            Dashboard
        </button>
    </div>
    <button class="close-btn" aria-label="Close">×</button>
</div>
    `;

        // Add styles
        const styles = document.createElement('style');
        styles.textContent = `
.cl-data-manager-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10002;
    /* Add smooth entrance animation */
    animation: modalFadeIn 0.3s ease;
}

@keyframes modalFadeIn {
    from {
        opacity: 0;
        transform: scale(0.95);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}

.cl-data-manager-modal .modal-content {
    background: linear-gradient(145deg, #232323, #1a1a1a);
    padding: 30px;
    border-radius: 20px;
    position: relative;
    min-width: 320px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.cl-data-manager-modal h2 {
    color: white;
    margin-bottom: 25px;
    font-size: 24px;
    font-weight: 600;
    text-align: center;
    /* Add subtle text shadow for better contrast */
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.option-buttons {
    display: flex;
    gap: 15px;
    flex-direction: column; /* Stack buttons vertically */
    width: 100%;
}

.option-buttons button {
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    background: linear-gradient(145deg, #5a9ee8, #4a90e2);
    color: white;
    font-weight: 500;
    font-size: 16px;
    transition: all 0.3s ease;
    width: 100%;
    /* Add subtle shadow */
    box-shadow: 0 2px 8px rgba(74, 144, 226, 0.3);
}

.option-buttons button:hover {
    background: linear-gradient(145deg, #357abd, #4a90e2);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(74, 144, 226, 0.4);
}

.option-buttons button:active {
    transform: translateY(0);
}

.close-btn {
    position: absolute;
    top: 15px;
    right: 15px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    font-size: 24px;
    cursor: pointer;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: rotate(90deg);
}

    `;
        document.head.appendChild(styles);
        document.body.appendChild(modal);

        // Add event listeners
        modal.querySelector('#getProjectTimeBtn').addEventListener('click', () => {
            modal.remove();
            showProjectTimeInput();
        });

        modal.querySelector('#showDashboardBtn').addEventListener('click', () => {
            modal.remove();
            showCohortSelection();
        });

        modal.querySelector('.close-btn').addEventListener('click', () => {
            modal.remove();
        });
    }

    function showProjectTimeInput() {
        const modal = document.createElement('div');
        modal.className = 'project-time-modal';
        modal.innerHTML = `
<div class="project-time-modal">
    <div class="modal-content">
        <header class="modal-header">
            <h2>Project Time Search</h2>
            <button class="close-btn" aria-label="Close">
                <svg width="24" height="24" viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            </button>
        </header>

        <div class="search-section">
            <div class="input-container">
                <div class="input-wrapper">
                    <input type="text"
                           id="projectNumberInput"
                           placeholder="Enter Project Number"
                           class="project-input"
                           autocomplete="off">
                    <span class="input-focus-border"></span>
                </div>
    <button id="searchProjectBtn" class="search-btn">
        <svg class="search-icon" viewBox="0 0 24 24">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <span>Search</span>
    </button>
            </div>
        </div>

        <div id="projectTimeResults" class="results-container">
            <!-- Results will be populated here -->
        </div>
    </div>
</div>
    `;

        // Add styles
        const styles = document.createElement('style');
        styles.textContent = `
:root {
    --bg-primary: #1a1b1e;
    --bg-secondary: #2c2c2c;
    --bg-input: #1e1e1e;
    --text-primary: #ffffff;
    --text-secondary: #e0e0e0;
    --accent-primary: #2196f3;
    --accent-hover: #42a5f5;
    --border-color: #404040;
    --hover-color: #363636;
    --success-color: #4caf50;
    --error-color: #f44336;
    --modal-backdrop: rgba(0, 0, 0, 0.8);
}

.project-time-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--modal-backdrop);
    backdrop-filter: blur(5px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10002;
    animation: fadeIn 0.3s ease-out;
}

.modal-content {
    background: var(--bg-primary);
    padding: 2rem;
    border-radius: 12px;
    width: 95%;
    max-width: 1200px;
    max-height: 90vh;
    position: relative;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    border: 1px solid var(--border-color);
    animation: slideUp 0.3s ease-out;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
}

.modal-header h2 {
    color: var(--text-primary);
    font-size: 1.75rem;
    font-weight: 600;
    margin: 0;
}

.input-container {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    position: relative;
}

.input-wrapper {
    flex: 1;
    position: relative;
}

.input-wrapper::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0) 100%);
    pointer-events: none;
}

.project-input {
    width: 100%;
    padding: 0.875rem 1rem;
    font-size: 1rem;
    background-color: var(--bg-input) !important;
    border: 2px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary) !important;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.project-input::placeholder {
    color: #666666;
    opacity: 1;
}

.project-input:hover {
    border-color: var(--accent-primary);
    background-color: #242424 !important;
}

.project-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    background-color: #242424 !important;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.2);
    animation: focusRing 0.6s ease-out;
}

.search-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    background: var(--accent-primary);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 120px;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.search-btn:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.search-btn:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.search-icon {
    width: 20px;
    height: 20px;
    fill: currentColor;
}

.results-container {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1.5rem;
    overflow: auto;
    flex: 1;
    min-height: 300px;
}

.results-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    color: var(--text-primary);
}

.results-table th {
    background: var(--bg-primary);
    padding: 1rem;
    text-align: left;
    font-weight: 600;
    color: var(--accent-primary);
    border-bottom: 2px solid var(--border-color);
}

.results-table td {
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--border-color);
    color: var(--text-secondary);
}

.results-table tr:hover {
    background-color: var(--hover-color);
}

.loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 2rem;
    color: var(--accent-primary);
}

.loading-spinner {
    border: 3px solid rgba(33, 150, 243, 0.2);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
    margin-right: 1rem;
}

.error-message {
    background-color: rgba(244, 67, 54, 0.1);
    color: var(--error-color);
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid var(--error-color);
    margin-top: 1rem;
}

.no-results {
    color: var(--text-secondary);
    text-align: center;
    padding: 2rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
}

.close-btn {
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
}

.close-btn:hover {
    background: var(--hover-color);
    color: var(--text-primary);
}

.close-btn svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
}

/* Autofill Styles */
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active {
    -webkit-box-shadow: 0 0 0 30px var(--bg-input) inset !important;
    -webkit-text-fill-color: var(--text-primary) !important;
    caret-color: var(--text-primary) !important;
}

/* Scrollbar Styles */
.results-container::-webkit-scrollbar {
    width: 8px;
}

.results-container::-webkit-scrollbar-track {
    background: var(--bg-input);
    border-radius: 4px;
}

.results-container::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 4px;
}

.results-container::-webkit-scrollbar-thumb:hover {
    background: var(--accent-primary);
}

/* Animations */
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

@keyframes focusRing {
    0% {
        box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.4);
    }
    100% {
        box-shadow: 0 0 0 4px rgba(33, 150, 243, 0);
    }
}

/* Responsive Design */
@media (max-width: 768px) {
    .modal-content {
        padding: 1.5rem;
        margin: 1rem;
    }

    .input-container {
        flex-direction: column;
    }

    .search-btn {
        width: 100%;
    }

    .results-table {
        font-size: 0.875rem;
    }

    .results-table th,
    .results-table td {
        padding: 0.75rem;
    }
}

@media (max-width: 480px) {
    .modal-content {
        padding: 1rem;
    }

    .modal-header h2 {
        font-size: 1.25rem;
    }

    .project-input,
    .search-btn {
        padding: 0.75rem 1rem;
    }
}
    `;
        document.head.appendChild(styles);
        document.body.appendChild(modal);

        // Add event listeners
        const searchBtn = modal.querySelector('#searchProjectBtn');
        const projectInput = modal.querySelector('#projectNumberInput');
        const resultsContainer = modal.querySelector('#projectTimeResults');

        // Focus the input after modal opens
        setTimeout(() => {
            modal.querySelector('#projectNumberInput').focus();
        }, 100);

        // Close modal on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        searchBtn.addEventListener('click', () => {
            const projectNumber = projectInput.value.trim();
            if (projectNumber) {
                searchCohortProjectTime(projectNumber, resultsContainer);
            } else {
                showCustomAlert('Please enter a project number');
            }
        });

        modal.querySelector('.close-btn').addEventListener('click', () => {
            modal.remove();
        });

        // Add enter key support
        projectInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchBtn.click();
            }
        });
    }

    async function searchCohortProjectTime(projectNumber, resultsContainer) {
        try {
            await injectAuthStyles();
            await loadAwsSdk();
            await loadCognitoSdk();

            // Show loading state
            resultsContainer.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <span class="loading-text">Searching project time data...</span>
            </div>`;

            const token = await AuthService.ensureAuthenticated();
            await configureAWS(token);
            if (!token) throw new Error('Authentication failed');

            // Configure AWS
            AWS.config.update({
                region: 'eu-north-1',
                credentials: new AWS.CognitoIdentityCredentials({
                    IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                    Logins: {
                        'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                    }
                })
            });

            const s3 = new AWS.S3();
            const bucketName = 'aux-data-bucket';
            const projectDataMap = new Map();
            const normalizedSearchNumber = normalizeProjectNumber(projectNumber);

            const nonConductLabels = [
                'Defect Tracker Creation',
                'In-Project Meeting',
                'Multi-Site Calibration',
                'Personal Quality Check',
                'Post Project Clarity',
                'Project Planning',
                'Project Prep Review',
                'Project Rework',
                'Project Rollup',
                'Project Scoping',
                'Quality Review by PL',
                'Quip Review and Update',
                'Non Conduct Project'
            ];

            for (const prefix of ['Aura_NPT_', 'aux_data_']) {
                const response = await s3.listObjectsV2({
                    Bucket: bucketName,
                    Prefix: prefix
                }).promise();

                for (const item of response.Contents) {
                    const data = await s3.getObject({
                        Bucket: bucketName,
                        Key: item.Key
                    }).promise();

                    const fileContent = data.Body.toString('utf-8');
                    const rows = fileContent.split('\n').slice(1);

                    rows.forEach(row => {
                        if (!row.trim()) return;

                        const columns = row.split(',').map(col => col.trim());

                        if (prefix === 'Aura_NPT_') {
                            // Process Aura_NPT_ file
                            if (columns.length >= 9) {
                                const projectTitle = columns[8];
                                const normalizedProjectTitle = normalizeProjectNumber(projectTitle);

                                if (normalizedProjectTitle === normalizedSearchNumber) {
                                    const date = columns[0];
                                    const username = columns[2];
                                    const auxLabel3 = columns[5];
                                    const timeMinutes = parseFloat(columns[6]);

                                    const key = `${projectTitle}-${date}-${username}`;
                                    if (!projectDataMap.has(key)) {
                                        projectDataMap.set(key, {
                                            date,
                                            username,
                                            projectTitle,
                                            conductTime: 0,
                                            nonConductTime: 0
                                        });
                                    }

                                    const entry = projectDataMap.get(key);
                                    const timeHours = timeMinutes / 60;

                                    if (auxLabel3.trim() === 'Conduct Project') {
                                        entry.conductTime += timeHours;
                                    } else if (auxLabel3.trim() === 'Non Conduct Project' ||
                                               nonConductLabels.some(label => auxLabel3.trim() === label)) {
                                        entry.nonConductTime += timeHours;
                                    }
                                }
                            }
                        } else {
                            // Process aux_data_ file
                            if (columns.length >= 5) {
                                const projectTitle = columns[4];
                                const normalizedProjectTitle = normalizeProjectNumber(projectTitle);

                                if (normalizedProjectTitle === normalizedSearchNumber) {
                                    const date = columns[0];
                                    const username = columns[1];
                                    const auxLabel = columns[2];
                                    const timeSpent = columns[3];

                                    const key = `${projectTitle}-${date}-${username}`;
                                    if (!projectDataMap.has(key)) {
                                        projectDataMap.set(key, {
                                            date,
                                            username,
                                            projectTitle,
                                            conductTime: 0,
                                            nonConductTime: 0
                                        });
                                    }

                                    const entry = projectDataMap.get(key);

                                    let timeHours = 0;
                                    if (timeSpent.includes(':')) {
                                        const [hours, minutes, seconds] = timeSpent.split(':').map(Number);
                                        timeHours = hours + (minutes / 60) + (seconds / 3600);
                                    }

                                    if (auxLabel.includes('Conduct Project')) {
                                        entry.conductTime += timeHours;
                                    } else if (nonConductLabels.some(label => auxLabel.includes(label))) {
                                        entry.nonConductTime += timeHours;
                                    }
                                }
                            }
                        }
                    });
                }
            }

            // Convert Map to array and sort by date
            const sortedData = Array.from(projectDataMap.values())
            .sort((a, b) => new Date(a.date) - new Date(b.date));

            // Display results
            if (sortedData.length > 0) {
                resultsContainer.innerHTML = `
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Project Number</th>
                            <th>Date</th>
                            <th>Username</th>
                            <th>Non Conduct Project Time (Hours)</th>
                            <th>Conduct Project Time (Hours)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedData.map(entry => `
                            <tr>
                                <td>${entry.projectTitle}</td>
                                <td>${entry.date}</td>
                                <td>${entry.username}</td>
                                <td>${entry.nonConductTime.toFixed(2)}</td>
                                <td>${entry.conductTime.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            } else {
                resultsContainer.innerHTML = `
                <div class="no-results">
                    No data found for project number: ${projectNumber}
                </div>
            `;
            }

        } catch (error) {
            console.error('Error searching project time:', error);
            resultsContainer.innerHTML = `
            <div class="error-message">
                Error searching project time: ${error.message}
            </div>
        `;
        }
    }

    function showCohortSelection() {
        const modal = document.createElement('div');
        modal.className = 'cohort-selection-modal';
        modal.innerHTML = `
        <div class="modal-content">
            <h2>Select Cohort</h2>
            <div class="cohort-buttons">
                ${Array.from({length: 7}, (_, i) => i + 1).map(num => `
                    <button class="cohort-btn" data-cohort="${num}">
                        <span class="cohort-number">0${num}</span>
                        <span class="cohort-label">Cohort</span>
                    </button>
                `).join('')}
            </div>
            <button class="close-btn" aria-label="Close">×</button>
        </div>
    `;

        // Add styles
        const styles = document.createElement('style');
        styles.textContent = `
        :root {
            --bg-primary: #121212;
            --bg-secondary: #1e1e1e;
            --text-primary: #ffffff;
            --text-secondary: #a0a0a0;
            --accent-primary: #3d9bff;
            --accent-secondary: #007fff;
            --border-color: #2a2a2a;
            --hover-color: #252525;
            --success-color: #4caf50;
            --error-color: #ff4444;
        }

        .cohort-selection-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(30, 30, 46, 0.95);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10002;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
        }

        .cohort-selection-modal .modal-content {
            background: var(--bg-primary);
            padding: 32px;
            border-radius: 20px;
            position: relative;
            min-width: 480px;
            border: 1px solid var(--border-color);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            animation: modalFadeIn 0.3s ease;
        }

        @keyframes modalFadeIn {
            from {
                opacity: 0;
                transform: scale(0.95);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }

        .cohort-selection-modal h2 {
            color: var(--text-primary);
            font-size: 28px;
            margin-bottom: 24px;
            text-align: center;
            font-weight: 600;
        }

        .cohort-buttons {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-top: 20px;
        }

        .cohort-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            cursor: pointer;
            transition: all 0.3s ease;
            gap: 8px;
        }

        .cohort-btn:hover {
            background: var(--hover-color);
            border-color: var(--accent-primary);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(137, 180, 250, 0.1);
        }

        .cohort-btn:active {
            transform: translateY(0);
        }

        .cohort-number {
            font-size: 24px;
            font-weight: 600;
            color: var(--accent-primary);
        }

        .cohort-label {
            font-size: 14px;
            color: var(--text-secondary);
        }

        .close-btn {
            position: absolute;
            top: 20px;
            right: 20px;
            background: var(--bg-secondary);
            border: none;
            color: var(--text-secondary);
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 24px;
            transition: all 0.3s ease;
        }

        .close-btn:hover {
            background: var(--hover-color);
            color: var(--text-primary);
            transform: rotate(90deg);
        }

        @media screen and (max-width: 768px) {
            .cohort-selection-modal .modal-content {
                min-width: unset;
                width: 90%;
                padding: 24px;
            }

            .cohort-buttons {
                grid-template-columns: repeat(2, 1fr);
            }
        }

        @media screen and (max-width: 480px) {
            .cohort-buttons {
                grid-template-columns: 1fr;
            }

            .cohort-btn {
                padding: 16px;
            }

            .cohort-number {
                font-size: 20px;
            }
        }
    `;
        document.head.appendChild(styles);
        document.body.appendChild(modal);

        // Add event listeners
        modal.querySelectorAll('.cohort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cohortNumber = btn.dataset.cohort;
                modal.remove();
                showCohortDashboard(cohortNumber);
            });
        });

        modal.querySelector('.close-btn').addEventListener('click', () => {
            modal.remove();
        });
    }

    function convertTimeToHours(timeValue) {
        if (!timeValue) return '0.00';

        // If already in hours (number)
        if (typeof timeValue === 'number') {
            return (timeValue / 3600000).toFixed(2);
        }

        // If in HH:MM:SS format
        if (timeValue.includes(':')) {
            const [hours, minutes, seconds] = timeValue.split(':').map(Number);
            return ((hours + minutes/60 + seconds/3600)).toFixed(2);
        }

        // If in milliseconds (string)
        const numericValue = parseFloat(timeValue);
        if (!isNaN(numericValue)) {
            return (numericValue / 3600000).toFixed(2);
        }

        return '0.00';
    }

    async function showCohortDashboard(cohortNumber) {
        try {
            // Show loading indicator
            const loadingIndicator = createLoadingIndicator();
            document.body.appendChild(loadingIndicator);

            // First, ensure AWS SDK is loaded
            await loadAwsSdk();
            await loadCognitoSdk();

            // Get authentication token
            const token = await AuthService.ensureAuthenticated();
            if (!token) {
                throw new Error('Authentication failed');
            }

            // Configure AWS with the correct credentials
            await new Promise((resolve, reject) => {
                AWS.config.region = 'eu-north-1';
                AWS.config.credentials = new AWS.CognitoIdentityCredentials({
                    IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                    Logins: {
                        'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                    }
                });

                AWS.config.credentials.get((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            // Create dashboard container
            const dashboard = document.createElement('div');
            dashboard.className = 'cohort-dashboard';
            dashboard.innerHTML = `
            <div class="dashboard-header">
                <h2>Cohort ${cohortNumber} Dashboard</h2>
                <div class="dashboard-controls">
                    <div class="filter-section">
                        <div class="filter-group">
                            <label>Time Period</label>
                            <div class="filter-controls">
                                <select id="yearFilter">
                                    ${generateYearOptions()}
                                </select>
                                <select id="monthFilter">
                                    ${generateMonthOptions()}
                                </select>
                                <select id="weekFilter">
                                    <option value="all">All Weeks</option>
                                    ${generateWeekOptions()}
                                </select>
                            </div>
                        </div>
                        <div class="filter-group">
                            <label>Search Filters</label>
                            <div class="search-filters">
                                <input type="text"
                                       id="projectTitleFilter"
                                       placeholder="Filter by project title"
                                       class="search-input">
                                <input type="text"
                                       id="usernameFilter"
                                       placeholder="Filter by username"
                                       class="search-input">
                            </div>
                        </div>
                        <div class="filter-group">
                            <label>Project Type</label>
                            <div class="project-type-filter">
                                <button class="filter-btn active" data-type="all">All</button>
                                <button class="filter-btn" data-type="microsite">Microsite</button>
                                <button class="filter-btn" data-type="wf">WF</button>
                            </div>
                        </div>
                    </div>
                    <div class="action-buttons">
                        <button id="exportDashboard">Export Data</button>
                        <button class="close-dashboard">×</button>
                    </div>
                </div>
            </div>
            <div class="dashboard-content">
                <div class="dashboard-grid">
                    <div class="summary-section">
                        <div class="summary-cards"></div>
                        <div class="chart-container">
                            <canvas id="timeDistributionChart"></canvas>
                        </div>
                    </div>
                    <div class="projects-section">
                        <div class="projects-grid"></div>
                    </div>
                </div>
            </div>
        `;

            // Add dashboard styles
            const styles = document.createElement('style');
            styles.textContent = `
            .cohort-dashboard {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.95);
                z-index: 10003;
                display: flex;
                flex-direction: column;
                padding: 20px;
                color: white;
                backdrop-filter: blur(10px);
            }

            .dashboard-header {
                margin-bottom: 20px;
            }

            .dashboard-controls {
                display: flex;
                flex-direction: column;
                gap: 15px;
            }

            .filter-section {
                display: flex;
                gap: 20px;
                flex-wrap: wrap;
                padding: 15px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 10px;
            }

            .filter-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .filter-group label {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.7);
            }

            .filter-controls {
                display: flex;
                gap: 10px;
            }

            .filter-controls select,
            .search-input {
                padding: 8px;
                border-radius: 5px;
                background: black;
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.2);
                min-width: 120px;
            }

            .search-filters {
                display: flex;
                color: black;
                gap: 10px;
            }

            .search-input {
                width: 200px;
                color: black;
            }

            .project-type-filter {
                display: flex;
                gap: 8px;
            }

            .filter-btn {
                padding: 8px 16px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 5px;
                background: transparent;
                color: white;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .filter-btn.active {
                background: #4a90e2;
                border-color: #4a90e2;
            }

            .dashboard-content {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
            }

            .dashboard-grid {
                display: grid;
                grid-template-columns: 300px 1fr;
                gap: 20px;
                height: 100%;
            }

            .summary-section {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 10px;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .summary-cards {
                display: flex;
                flex-direction: column;
                gap: 15px;
            }

            .summary-card {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                padding: 15px;
            }

            .summary-card h4 {
                margin: 0;
                font-size: 14px;
                color: rgba(255, 255, 255, 0.7);
            }

            .summary-card p {
                margin: 5px 0 0;
                font-size: 24px;
                font-weight: 600;
            }

            .projects-section {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 10px;
                padding: 20px;
            }

            .projects-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 20px;
            }

            .project-card {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                padding: 15px;
                transition: transform 0.3s ease;
            }

            .project-card:hover {
                transform: translateY(-5px);
            }

            .action-buttons {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }

            .action-buttons button {
                padding: 8px 16px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                background: #4a90e2;
                color: white;
                transition: all 0.3s ease;
            }

            .close-dashboard {
                background: #dc3545 !important;
            }

            .chart-container {
                margin-top: 20px;
                padding: 15px;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 8px;
            }
        `;
            document.head.appendChild(styles);
            document.body.appendChild(dashboard);

            // Add event listeners
            dashboard.querySelector('.close-dashboard').addEventListener('click', () => {
                dashboard.remove();
                styles.remove();
            });

            // Get cohort members
            const cohortMembers = getCohortMembers(cohortNumber);

            // Fetch and process data
            const s3 = new AWS.S3();
            const bucketName = 'aux-data-bucket';
            const prefixes = ['Aura_NPT_', 'aux_data_'];
            const projectDataMap = new Map();

            const nonConductLabels = [
                'Defect Tracker Creation',
                'In-Project Meeting',
                'Multi-Site Calibration',
                'Personal Quality Check',
                'Post Project Clarity',
                'Project Planning',
                'Project Prep Review',
                'Project Rework',
                'Project Rollup',
                'Project Scoping',
                'Quality Review by PL',
                'Quip Review and Update',
                'Non Conduct Project'
            ];

            for (const prefix of prefixes) {
                const response = await s3.listObjectsV2({
                    Bucket: bucketName,
                    Prefix: prefix
                }).promise();

                for (const item of response.Contents) {
                    const data = await s3.getObject({
                        Bucket: bucketName,
                        Key: item.Key
                    }).promise();

                    const fileContent = data.Body.toString('utf-8');
                    const rows = fileContent.split('\n').slice(1);

                    rows.forEach(row => {
                        if (!row.trim()) return;

                        const columns = row.split(',').map(col => col.trim());

                        if (prefix === 'Aura_NPT_') {
                            // Process Aura_NPT_ file
                            if (columns.length >= 9 &&
                                cohortMembers.includes(columns[2]) && // Username is in column 2
                                (columns[8].startsWith('Microsite-') || columns[8].startsWith('WF-'))) {

                                const date = columns[0];
                                const username = columns[2];
                                const auxLabel3 = columns[5]; // Aux Label 3
                                const timeMinutes = parseFloat(columns[6]); // Time (minutes)
                                const projectTitle = columns[8];

                                const key = `${normalizeProjectNumber(projectTitle)}-${date}-${username}`;
                                if (!projectDataMap.has(key)) {
                                    projectDataMap.set(key, {
                                        date,
                                        username,
                                        projectTitle, // Keep original format for display
                                        normalizedProjectNumber: normalizeProjectNumber(projectTitle),
                                        conductTime: 0,
                                        nonConductTime: 0
                                    });
                                }

                                const entry = projectDataMap.get(key);
                                const timeHours = timeMinutes / 60; // Convert minutes to hours

                                // Updated condition to match searchCohortProjectTime
                                if (auxLabel3.trim() === 'Conduct Project') {
                                    entry.conductTime += timeHours;
                                } else if (auxLabel3.trim() === 'Non Conduct Project' ||
                                           nonConductLabels.some(label => auxLabel3.trim() === label)) {
                                    entry.nonConductTime += timeHours;
                                }
                            }
                        } else {
                            // Process aux_data_ file
                            if (columns.length >= 5 &&
                                cohortMembers.includes(columns[1]) && // Username is in column 1
                                (columns[4].startsWith('Microsite-') || columns[4].startsWith('WF-'))) {

                                const date = columns[0];
                                const username = columns[1];
                                const auxLabel = columns[2];
                                const timeSpent = columns[3];
                                const projectTitle = columns[4];

                                const key = `${normalizeProjectNumber(projectTitle)}-${date}-${username}`;
                                if (!projectDataMap.has(key)) {
                                    projectDataMap.set(key, {
                                        date,
                                        username,
                                        projectTitle, // Keep original format for display
                                        normalizedProjectNumber: normalizeProjectNumber(projectTitle),
                                        conductTime: 0,
                                        nonConductTime: 0
                                    });
                                }

                                const entry = projectDataMap.get(key);

                                // Convert HH:MM:SS to hours
                                let timeHours = 0;
                                if (timeSpent.includes(':')) {
                                    const [hours, minutes, seconds] = timeSpent.split(':').map(Number);
                                    timeHours = hours + (minutes / 60) + (seconds / 3600);
                                }

                                // Updated condition to match searchCohortProjectTime
                                if (auxLabel.trim() === 'Conduct Project') {
                                    entry.conductTime += timeHours;
                                } else if (nonConductLabels.some(label => auxLabel.trim() === label)) {
                                    entry.nonConductTime += timeHours;
                                }
                            }
                        }
                    });
                }
            }

            // Convert Map to array and sort by date
            const projectData = Array.from(projectDataMap.values())
            .sort((a, b) => new Date(a.date) - new Date(b.date));

            // Store original data for filtering
            dashboard.originalData = projectData;

            // Initialize filters
            initializeFilters(dashboard, projectData);

            // Update dashboard with data
            updateDashboardDisplay(projectData, dashboard);

            // Add export functionality
            dashboard.querySelector('#exportDashboard').addEventListener('click', () => {
                exportDashboardData(projectData);
            });

        } catch (error) {
            console.error('Error showing cohort dashboard:', error);
            showCustomAlert('Error loading dashboard: ' + error.message);
        } finally {
            const loadingIndicator = document.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
        }
    }

    // Initialize filters function
    function initializeFilters(dashboard, originalData) {
        const projectTitleFilter = dashboard.querySelector('#projectTitleFilter');
        const usernameFilter = dashboard.querySelector('#usernameFilter');
        const projectTypeButtons = dashboard.querySelectorAll('.filter-btn');
        const yearFilter = dashboard.querySelector('#yearFilter');
        const monthFilter = dashboard.querySelector('#monthFilter');
        const weekFilter = dashboard.querySelector('#weekFilter');

        // Debounce function for search inputs
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // Filter function
        function applyFilters() {
            let filteredData = [...originalData];

            // Project title filter
            const projectTitle = projectTitleFilter.value.toLowerCase();
            if (projectTitle) {
                filteredData = filteredData.filter(item =>
                                                   item.projectTitle.toLowerCase().includes(projectTitle)
                                                  );
            }

            // Username filter
            const username = usernameFilter.value.toLowerCase();
            if (username) {
                filteredData = filteredData.filter(item =>
                                                   item.username.toLowerCase().includes(username)
                                                  );
            }

            // Project type filter
            const activeTypeButton = dashboard.querySelector('.filter-btn.active');
            if (activeTypeButton && activeTypeButton.dataset.type !== 'all') {
                const type = activeTypeButton.dataset.type;
                filteredData = filteredData.filter(item =>
                                                   item.projectTitle.toLowerCase().startsWith(type)
                                                  );
            }

            // Time period filters
            const selectedYear = yearFilter.value;
            const selectedMonth = monthFilter.value;
            const selectedWeek = weekFilter.value;

            filteredData = filteredData.filter(item => {
                const itemDate = new Date(item.date);
                const yearMatch = selectedYear === 'all' || itemDate.getFullYear().toString() === selectedYear;
                const monthMatch = selectedMonth === 'all' || (itemDate.getMonth() + 1).toString() === selectedMonth;
                const weekMatch = selectedWeek === 'all' || getWeekNumber(itemDate).toString() === selectedWeek;
                return yearMatch && monthMatch && weekMatch;
            });

            updateDashboardDisplay(filteredData, dashboard);
        }

        // Add event listeners
        projectTitleFilter.addEventListener('input', debounce(() => applyFilters(), 300));
        usernameFilter.addEventListener('input', debounce(() => applyFilters(), 300));

        projectTypeButtons.forEach(button => {
            button.addEventListener('click', () => {
                projectTypeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                applyFilters();
            });
        });

        [yearFilter, monthFilter, weekFilter].forEach(filter => {
            filter.addEventListener('change', applyFilters);
        });
    }

    // Updated updateDashboardDisplay function
    function updateDashboardDisplay(projectData, dashboard) {
        const summarySection = dashboard.querySelector('.summary-cards');
        const projectsGrid = dashboard.querySelector('.projects-grid');

        // Calculate summary data
        const summary = {
            totalConductHours: 0,
            totalNonConductHours: 0,
            uniqueProjects: new Set(),
            uniqueUsers: new Set()
        };

        projectData.forEach(entry => {
            summary.totalConductHours += entry.conductTime;
            summary.totalNonConductHours += entry.nonConductTime;
            summary.uniqueProjects.add(entry.projectTitle);
            summary.uniqueUsers.add(entry.username);
        });

        // Update summary cards
        summarySection.innerHTML = `
        <div class="summary-card">
            <h4>Total Projects</h4>
            <p>${summary.uniqueProjects.size}</p>
        </div>
        <div class="summary-card">
            <h4>Total Team Members</h4>
            <p>${summary.uniqueUsers.size}</p>
        </div>
        <div class="summary-card">
            <h4>Conduct Time</h4>
            <p>${summary.totalConductHours.toFixed(2)}h</p>
        </div>
        <div class="summary-card">
            <h4>Non-Conduct Time</h4>
            <p>${summary.totalNonConductHours.toFixed(2)}h</p>
        </div>
    `;

        // Group projects by normalized project number
        const projectGroups = new Map();
        projectData.forEach(entry => {
            const normalizedNumber = normalizeProjectNumber(entry.projectTitle);
            if (!projectGroups.has(normalizedNumber)) {
                projectGroups.set(normalizedNumber, {
                    conductTime: 0,
                    nonConductTime: 0,
                    users: new Set(),
                    dates: new Set(),
                    formats: new Set([entry.projectTitle]) // Track different formats
                });
            }
            const group = projectGroups.get(normalizedNumber);
            group.conductTime += entry.conductTime;
            group.nonConductTime += entry.nonConductTime;
            group.users.add(entry.username);
            group.dates.add(entry.date);
            group.formats.add(entry.projectTitle);
        });

        // Generate project cards with all formats
        projectsGrid.innerHTML = generateProjectCards(projectGroups);

        // Add click handlers for project cards
        projectsGrid.querySelectorAll('.project-card').forEach(card => {
            card.addEventListener('click', () => {
                card.querySelector('.project-details').classList.toggle('hidden');
            });
        });
    }

    // Updated generateProjectCards function
    function generateProjectCards(projectGroups) {
        return Array.from(projectGroups.entries()).map(([projectTitle, details]) => `
        <div class="project-card">
            <div class="project-header">
                <h3>${projectTitle}</h3>
                <div class="project-stats">
                    <div class="stat">
                        <span class="stat-label">Total Time</span>
                        <span class="stat-value">${(details.conductTime + details.nonConductTime).toFixed(2)}h</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Team Members</span>
                        <span class="stat-value">${details.users.size}</span>
                    </div>
                </div>
            </div>
            <div class="project-progress">
                <div class="progress-bar">
                    <div class="progress-conduct" style="width: ${calculateProgressWidth(details.conductTime, details)}%"></div>
                    <div class="progress-non-conduct" style="width: ${calculateProgressWidth(details.nonConductTime, details)}%"></div>
                </div>
            </div>
            <div class="project-details hidden">
                <div class="time-breakdown">
                    <div class="breakdown-item">
                        <span>Conduct Time:</span>
                        <span>${details.conductTime.toFixed(2)}h</span>
                    </div>
                    <div class="breakdown-item">
                        <span>Non-Conduct Time:</span>
                        <span>${details.nonConductTime.toFixed(2)}h</span>
                    </div>
                </div>
                <div class="team-members">
                    <h4>Team Members</h4>
                    <div class="member-tags">
                        ${Array.from(details.users).map(user => `
                            <span class="member-tag">${user}</span>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    }

    // Helper function to calculate progress bar widths
    function calculateProgressWidth(time, details) {
        const totalTime = details.conductTime + details.nonConductTime;
        return totalTime > 0 ? (time / totalTime) * 100 : 0;
    }

    function initializeCharts(data) {
        // Time Distribution Chart
        const timeDistributionChart = new Chart(
            document.getElementById('timeDistributionChart'),
            {
                type: 'doughnut',
                data: {
                    labels: ['Conduct Time', 'Non-Conduct Time'],
                    datasets: [{
                        data: [
                            data.totalConductHours,
                            data.totalNonConductHours
                        ],
                        backgroundColor: [
                            'rgba(74, 144, 226, 0.8)',
                            'rgba(99, 179, 237, 0.8)'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: 'white'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time Distribution',
                            color: 'white'
                        }
                    }
                }
            }
        );

        // Project Progress Chart
        const projectProgressChart = new Chart(
            document.getElementById('projectProgressChart'),
            {
                type: 'bar',
                data: {
                    labels: Array.from(data.projectDetails.keys()),
                    datasets: [{
                        label: 'Conduct Time',
                        data: Array.from(data.projectDetails.values())
                        .map(p => p.conductHours),
                        backgroundColor: 'rgba(74, 144, 226, 0.8)'
                    },
                               {
                                   label: 'Non-Conduct Time',
                                   data: Array.from(data.projectDetails.values())
                                   .map(p => p.nonConductHours),
                                   backgroundColor: 'rgba(99, 179, 237, 0.8)'
                               }]
                },
                options: {
                    responsive: true,
                    scales: {
                        x: {
                            stacked: true,
                            ticks: { color: 'white' }
                        },
                        y: {
                            stacked: true,
                            ticks: { color: 'white' }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: 'white' }
                        }
                    }
                }
            }
        );
    }

    // Add this to your existing helper functions
    function addFilterEventListeners(dashboard, projectData) {
        const filters = dashboard.querySelectorAll('.filter-controls select, .search-input');
        filters.forEach(filter => {
            filter.addEventListener('change', () => {
                const filteredData = applyAllFilters(projectData, dashboard);
                updateDashboardDisplay(filteredData, dashboard);
            });
        });

        dashboard.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                dashboard.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filteredData = applyAllFilters(projectData, dashboard);
                updateDashboardDisplay(filteredData, dashboard);
            });
        });

        // Add input event listeners for search filters
        ['projectTitleFilter', 'usernameFilter'].forEach(filterId => {
            const input = dashboard.querySelector(`#${filterId}`);
            input.addEventListener('input', CLdebounce(() => {
                const filteredData = applyAllFilters(projectData, dashboard);
                updateDashboardDisplay(filteredData, dashboard);
            }, 300));
        });
    }

    function applyAllFilters(data, dashboard) {
        const yearFilter = dashboard.querySelector('#yearFilter').value;
        const monthFilter = dashboard.querySelector('#monthFilter').value;
        const weekFilter = dashboard.querySelector('#weekFilter').value;
        const projectFilter = dashboard.querySelector('#projectTitleFilter').value.toLowerCase();
        const usernameFilter = dashboard.querySelector('#usernameFilter').value.toLowerCase();
        const projectType = dashboard.querySelector('.filter-btn.active').dataset.type;

        return data.filter(item => {
            const date = new Date(item.date);
            const yearMatch = yearFilter === 'all' || date.getFullYear().toString() === yearFilter;
            const monthMatch = monthFilter === 'all' || (date.getMonth() + 1).toString() === monthFilter;
            const weekMatch = weekFilter === 'all' || getWeekNumber(date).toString() === weekFilter;

            // Normalize both the search term and the project number for comparison
            const searchTerm = normalizeProjectNumber(projectFilter.toLowerCase());
            const itemProjectNumber = normalizeProjectNumber(item.projectTitle.toLowerCase());
            const projectMatch = itemProjectNumber.includes(searchTerm);

            const usernameMatch = item.username.toLowerCase().includes(usernameFilter);
            const typeMatch = projectType === 'all' ||
                  (projectType === 'microsite' && item.projectTitle.startsWith('Microsite-')) ||
                  (projectType === 'wf' && item.projectTitle.startsWith('WF-'));

            return yearMatch && monthMatch && weekMatch && projectMatch && usernameMatch && typeMatch;
        });
    }

    function CLdebounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    //Helper Functions//
    // 1. Generate year options (current year and previous year)
    function generateYearOptions() {
        const currentYear = new Date().getFullYear();
        return `
        <option value="${currentYear}">${currentYear}</option>
        <option value="${currentYear - 1}">${currentYear - 1}</option>
    `;
    }

    // 2. Generate month options
    function generateMonthOptions() {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return `
        <option value="all">All Months</option>
        ${months.map((month, index) =>
                     `<option value="${index + 1}">${month}</option>`
        ).join('')}
    `;
    }

    // 3. Generate week options
    function generateWeekOptions() {
        return Array.from({ length: 52 }, (_, i) =>
                          `<option value="${i + 1}">Week ${i + 1}</option>`
    ).join('');
    }

    // 4. Get cohort members based on cohort number
    function getCohortMembers(cohortNumber) {
        const cohortMap = {
            1: ['rhtng', 'ehemoham', 'mohdhme', 'ebbraga', 'qiach', 'wuxiangj', 'caifeng',
                'tnwang', 'yuhatian', 'aalziat', 'abdlahou', 'affalsap', 'buenavef',
                'radilor', 'rccabbia'],
            2: ['tvant', 'nshsx', 'kotnisai', 'thatikr', 'annherrm', 'haiyabai', 'ningwa',
                'jiqing', 'heluo', 'hongyun', 'aalziat', 'abdlahou', 'affalsap', 'buenavef',
                'radilor', 'rccabbia'],
            3: ['mohaame', 'rajibdut', 'metinees', 'zizheng', 'lipinyua', 'jingjieh',
                'lijul', 'aalziat', 'abdlahou', 'affalsap', 'buenavef', 'radilor', 'rccabbia'],
            4: ['mdiahmed', 'mofila', 'nitscd', 'danyangl', 'ruish', 'yanxij', 'wdongxu',
                'aalziat', 'abdlahou', 'affalsap', 'buenavef', 'radilor', 'rccabbia'],
            5: ['albuquea', 'maddirap', 'shimontm', 'ramkeert', 'nitscd', 'chngqc',
                'wyunhan', 'yaxiongg', 'rongqing', 'aalziat', 'abdlahou', 'affalsap',
                'buenavef', 'radilor', 'rccabbia'],
            6: ['ebbraga'], // Add cohort 6 members when available
            7: ['prembhar', 'rahulgi', 'mshoib', 'aalziat', 'abdlahou', 'affalsap',
                'buenavef', 'radilor', 'rccabbia']
        };

        return cohortMap[cohortNumber] || [];
    }

    //5. normalizeProjectNumber
    function normalizeProjectNumber(projectTitle) {
        if (!projectTitle) return '';
        const match = projectTitle.match(/(?:WF-)?(\d+)/);
        return match ? match[1] : projectTitle;
    }

    // 6. Filter project data based on selected filters
    function filterProjectData(projectData, dashboard) {
        const yearFilter = dashboard.querySelector('#yearFilter').value;
        const monthFilter = dashboard.querySelector('#monthFilter').value;
        const weekFilter = dashboard.querySelector('#weekFilter').value;

        return projectData.filter(entry => {
            const entryDate = new Date(entry.date);
            const entryYear = entryDate.getFullYear().toString();
            const entryMonth = (entryDate.getMonth() + 1).toString();
            const entryWeek = getCohortWeekNumber(entryDate).toString();

            const yearMatch = yearFilter === 'all' || entryYear === yearFilter;
            const monthMatch = monthFilter === 'all' || entryMonth === monthFilter;
            const weekMatch = weekFilter === 'all' || entryWeek === weekFilter;

            return yearMatch && monthMatch && weekMatch;
        });
    }

    // 7. Export dashboard data
    // Export dashboard data
    function exportDashboardData(projectData) {
        // Prepare CSV content
        const headers = [
            'Date',
            'Username',
            'Project Title',
            'Non Conduct Hours',
            'Conduct Hours',
            'Total Hours'
        ];

        // Process data for export
        const processedRows = projectData.map(row => ({
            date: row.date,
            username: row.username,
            projectTitle: row.projectTitle,
            nonConductHours: row.nonConductTime || 0, // Changed from nonConductHours to nonConductTime
            conductHours: row.conductTime || 0, // Changed from conductHours to conductTime
            totalHours: (row.conductTime || 0) + (row.nonConductTime || 0)
        }));

        const csvContent = [
            headers.join(','),
            ...processedRows.map(row => [
                row.date,
                row.username,
                `"${row.projectTitle}"`,
                row.nonConductHours.toFixed(2),
                row.conductHours.toFixed(2),
                row.totalHours.toFixed(2)
            ].join(','))
        ].join('\n');

        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `cohort_project_data_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // Additional helper functions
    function processSummaryData(projectData) {
        const summary = {
            totalConductHours: 0,
            totalNonConductHours: 0,
            uniqueProjects: new Set(),
            projectDetails: new Map()
        };

        projectData.forEach(entry => {
            summary.totalConductHours += entry.conductTime;
            summary.totalNonConductHours += entry.nonConductTime;
            summary.uniqueProjects.add(entry.projectTitle);

            if (!summary.projectDetails.has(entry.projectTitle)) {
                summary.projectDetails.set(entry.projectTitle, {
                    conductHours: 0,
                    nonConductHours: 0,
                    users: new Set()
                });
            }

            const projectDetail = summary.projectDetails.get(entry.projectTitle);
            projectDetail.conductHours += entry.conductTime;
            projectDetail.nonConductHours += entry.nonConductTime;
            projectDetail.users.add(entry.username);
        });

        return summary;
    }

    function processDataForExport(projectData) {
        const processedData = new Map();

        projectData.forEach(entry => {
            const key = `${entry.date}-${entry.username}-${entry.projectTitle}`;
            if (!processedData.has(key)) {
                processedData.set(key, {
                    date: entry.date,
                    username: entry.username,
                    projectTitle: entry.projectTitle,
                    conductHours: 0,
                    nonConductHours: 0
                });
            }

            const record = processedData.get(key);
            const hours = convertTimeToHours(entry.time);

            if (entry.isConduct) {
                record.conductHours += hours;
            } else {
                record.nonConductHours += hours;
            }
        });

        return Array.from(processedData.values());
    }

    function getCohortWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
    ///////////////////////////////////////////////////
    async function showAuthModal() {
        return new Promise((resolve) => {
            const modal = createAuthModal();
            document.body.appendChild(modal);

            document.getElementById('auth-submit').addEventListener('click', async () => {
                const username = document.getElementById('username').value.trim();
                const password = document.getElementById('password').value.trim();

                if (!username || !password) {
                    showCustomAlert('Both username and password are required.');
                    return;
                }

                try {
                    document.body.removeChild(modal);
                    resolve({ username, password });
                } catch (error) {
                    showCustomAlert('Authentication failed. Please try again.');
                    console.error('Authentication error:', error);
                }
            });

            document.getElementById('auth-cancel').addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(null);
            });
        });
    }
    ///////////////////////////////////////////////////////////////
    //Widget
    // Add CSS styles
    const widgetStyles = document.createElement('style');
    widgetStyles.textContent = `
/* Core Widget Styling */
#aux-widget {
  position: fixed;
  top: 5px;
  left: 1000px;
  z-index: 10000;
  width: 250px;
  height: auto;
  max-height: 500px;
  overflow-y: auto;
  background: url(https://raw.githubusercontent.com/Mofi-l/static-images/main/Background.jpg) no-repeat center center / cover;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  color: white;
  transition: all 0.3s ease;
  will-change: transform, opacity, filter;
}

/* Enhanced Dropdown Styling */
#aux-widget select {
  width: 100%;
  padding: 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.75);
  color: white;
  font-size: 13px;
  font-family: 'Arial', sans-serif;
  transition: background-color 0.3s ease, color 0.3s ease;
  appearance: none;
  cursor: pointer;
}

#aux-widget select:hover {
  background-color: rgba(0, 0, 0, 0.75);
}

#aux-widget select:focus {
  outline: none;
  border: 1px solid #6c5ce7;
  box-shadow: 0 0 6px rgba(108, 92, 231, 0.7);
}

#aux-widget select option {
  background-color: #000;
  color: white;
  padding: 8px;
}

/* Dropdown Containers */
#aux-l2-container,
#aux-l3-container {
  margin-top: 10px;
  position: relative;
}

/* Timer Display */
#aux-timer {
  padding: 5px;
  margin-top: 5px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  font-size: 13px;
  color: #333;
}

/* Transparent Dropdown State */
.transparent-dropdown {
  background-color: rgba(0, 0, 0, 0.75) !important;
  color: white !important;
}

/* Action Buttons */
#action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 15px;
}

#action-buttons img {
  width: 30px;
  height: 30px;
  cursor: pointer;
  margin: 5px 2px;
  transition: transform 0.2s ease;
}

#action-buttons img:hover {
  transform: scale(1.1);
}

/* Minimize Box */
#minimized-box {
  position: fixed;
  bottom: 10px;
  right: 10px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  cursor: pointer;
  border-radius: 5px;
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  #aux-widget {
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 300px;
  }
}

/* Minimize Button */
#minimize-btn {
  cursor: pointer;
  position: absolute;
  top: -1px;
  right: 5px;
  z-index: 1;
}

#minimize-btn img {
  width: 50px;
  height: 50px;
  filter: drop-shadow(0 0 5px rgba(255, 165, 0, 0.5));
  animation: glowPulse 2s ease-in-out infinite;
  transition: all 0.3s ease;
}

#minimize-btn:hover img {
  filter: drop-shadow(0 0 10px rgba(255, 165, 0, 0.8));
  transform: scale(1.05);
}

/* Animations */
@keyframes glowPulse {
  0% {
    filter: drop-shadow(0 0 5px5px rgba(255, 165, 0, 0.5));
    transform: scale(1);
  }
  50% {
    filter: drop-shadow(0 0 15px rgba(255, 165, 0, 0.8));
    transform: scale(1.03);
  }
  100% {
    filter: drop-shadow(0 0 5px rgba(255, 165, 0, 0.5));
    transform: scale(1);
  }
}

@keyframes glowPulseHover {
  0% {
    filter: drop-shadow(0 0 10px rgba(255, 165, 0, 0.8));
    transform: scale(1.05);
  }
  50% {
    filter: drop-shadow(0 0 20px rgba(255, 165, 0, 1));
    transform: scale(1.08);
  }
  100% {
    filter: drop-shadow(0 0 10px rgba(255, 165, 0, 0.8));
    transform: scale(1.05);
  }
}

/* Toggle Button */
#toggle-button {
  background: transparent;
  border: none;
  cursor: pointer;
  position: relative;
  padding: 5px;
  transition: all 0.3s ease;
}

#toggle-button img {
  width: 15px;
  height: 15px;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

#toggle-button.active img {
  transform: rotate(180deg) scale(1.1);
}

#toggle-button:hover img {
  opacity: 0.8;
  transform: scale(1.1);
}

#toggle-button.active:hover img {
  transform: rotate(180deg) scale(1.1);
}

`;

    document.head.appendChild(widgetStyles);

    function preloadImages(imageUrls) {
        imageUrls.forEach((url) => {
            const img = new Image();
            img.src = url;
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        preloadImages([
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/download(1).png",
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/upload.png",
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/cloud-computing.png",
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/attachment.png",
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/guide.png",
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/delete.png",
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/bug.png",
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/table.png",
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/Background.png",
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/Aura.png",
            "https://raw.githubusercontent.com/Mofi-l/static-images/main/down.png"
        ]);
    });

    let lastL3Selection = '';
    let lastSelectedL1 = '';
    let lastSelectedL2 = '';
    let lastSelectedL3 = '';
    let finalSelectionMade = false;

    const l1Names = {
        '1': 'Contact Handling',
        '2': 'On Break',
        '3': 'Microsite Project Work',
        '4': 'Non-Microsite Work',
        '5': 'Stepping Away',
        '6': 'Offline'
    };

    const l2Mapping = {
        '3': ['Data Dive', 'UAT', 'Round Table', 'Quick Question', 'Document Review', 'DPM Request', 'CCRI Dive', 'Non-DE Project', 'Functional Testing', 'Data Analysis', 'Side by Side', 'FUAT', 'VoS (Voice of Sellers)', , 'Atlas Validation', 'Actionable Insights', 'Mapping Project', 'Reopen Insights', 'CLRO Deep Dive', 'NRR Deep Dive', 'TTR Deep Dive', 'Contact group validation', 'Cohort Lead Tasks', 'Project Quality Audit'],
        '4': ['Knowledge Retention Mode', 'In a Meeting', 'Personal Time', 'System Issue', 'In Training']
    };

    const l3Mapping = {
        'Data Dive': ['Conduct Project', 'Non Conduct Project'],
        'UAT': ['Conduct Project', 'Non Conduct Project'],
        'Round Table': ['Conduct Project', 'Non Conduct Project'],
        'Quick Question': ['Conduct Project', 'Non Conduct Project'],
        'Document Review': ['Conduct Project', 'Defect Tracker Creation', 'Non Conduct Project'],
        'DPM Request': ['Conduct Project', 'Defect Tracker Creation', 'Non Conduct Project'],
        'CCRI Dive': ['Conduct Project', 'Non Conduct Project'],
        'Non-DE Project': ['Conduct Project', 'Non Conduct Project'],
        'Functional Testing': ['Conduct Project', 'Non Conduct Project'],
        'Data Analysis': ['Conduct Project', 'Non Conduct Project'],
        'Side by Side': ['Conduct Project', 'Non Conduct Project'],
        'FUAT': ['Conduct Project', 'Non Conduct Project'],
        'VoS (Voice of Sellers)': ['Conduct Project', 'Non Conduct Project'],
        'Atlas Validation': ['Conduct Project', 'Non Conduct Project'],
        'Actionable Insights': ['Conduct Project', 'Non Conduct Project'],
        'Mapping Project': ['Conduct Project', 'Non Conduct Project'],
        'Reopen Insights': ['Conduct Project', 'Non Conduct Project'],
        'CLRO Deep Dive': ['Conduct Project', 'Non Conduct Project'],
        'NRR Deep Dive': ['Conduct Project', 'Non Conduct Project'],
        'TTR Deep Dive': ['Conduct Project', 'Non Conduct Project'],
        'Contact group validation': ['Conduct Project', 'Non Conduct Project'],
        'In a Meeting': ['Adhoc Leadership Request', 'Adhoc Leadership Task', 'Engagement Activity', 'Career Developement', 'Team Meeting']
    };

    function addHTML(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div);
    }

    let isWidgetMinimized = localStorage.getItem('widgetState') === 'minimized';

    function toggleWidget() {
        const widget = document.getElementById('aux-widget');
        const minimizedBox = document.getElementById('minimized-box');
        const widgetRect = widget.getBoundingClientRect();
        const boxRect = minimizedBox.getBoundingClientRect();
        const targetX = boxRect.left - widgetRect.left + (boxRect.width - widgetRect.width) / 2;
        const targetY = boxRect.top - widgetRect.top + (boxRect.height - widgetRect.height) / 2;

        widget.style.setProperty('--target-x', `${targetX}px`);
        widget.style.setProperty('--target-y', `${targetY}px`);

        if (isWidgetMinimized) {
            widget.classList.add('maximizing');
            widget.classList.remove('minimizing');
            widget.style.display = 'block';
            setTimeout(() => {
                widget.classList.remove('maximizing');
            }, 500);
            minimizedBox.textContent = 'Minimize Aura';
            localStorage.setItem('widgetState', 'maximized');
        } else {
            widget.classList.add('minimizing');
            widget.classList.remove('maximizing');
            setTimeout(() => {
                widget.style.display = 'none';
                widget.classList.remove('minimizing');
            }, 500);
            minimizedBox.textContent = 'Maximize Aura';
            localStorage.setItem('widgetState', 'minimized');
        }

        isWidgetMinimized = !isWidgetMinimized;
    }

    ////////////////////////////
    const widgetHTML = `
    <div id="aux-widget" style="position: fixed; top: 5px; left: 1000px; z-index: 10000; background: url(https://raw.githubusercontent.com/Mofi-l/static-images/main/Background.jpg) no-repeat center center / cover; padding: 20px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); color: white;">
                <div class="particles"></div>
         <div style="display: block;">
            <select id="aux-l1" onchange="handleL1Change(event)">
                <option value="">Select L1</option>
                <option value="1">Contact Handling</option>
                <option value="2">On Break</option>
                <option value="3">Microsite Project Work</option>
                <option value="4">Non-Microsite Work</option>
                <option value="5">Stepping Away</option>
                <option value="6">Offline</option>
            </select>
            <div id="aux-l2-container"></div>
            <div id="aux-l3-container"></div>
            <div id="aux-timer" style="padding: 10px; margin-top: 10px; background: rgba(255, 255, 255, 0.8); border-radius: 5px;"></div>
        </div>
        <!-- Minimize Button -->
        <div id="minimize-btn" style="cursor: pointer; position: absolute; top: -1px; right: 5px;" title="Created with ♥️ and a touch of ✨">
            <img src="https://raw.githubusercontent.com/Mofi-l/static-images/main/Aura.png" style="width: 50px; height: 50px;">
        </div>
    </div>
`;
    addHTML(widgetHTML);

    const minimizedBoxHTML = `
    <div id="minimized-box" style="position: fixed; bottom: 10px; right: 10px; padding: 10px; background: rgba(0, 0, 0, 0.7); color: white; cursor: pointer; border-radius: 5px;">
        ${isWidgetMinimized ? 'Maximize Aura' : 'Minimize Aura'}
    </div>
`;
    addHTML(minimizedBoxHTML);

    document.getElementById('aux-widget').addEventListener('change', function(event) {
        if (event.target.tagName === 'SELECT') {
            event.target.classList.add('transparent-dropdown');
        }
    });

    document.getElementById('aux-widget').addEventListener('click', function(event) {
        if (event.target.tagName === 'SELECT') {
            event.target.classList.remove('transparent-dropdown');
        }
    });
    document.getElementById('minimize-btn').addEventListener('click', toggleWidget);
    document.getElementById('minimized-box').addEventListener('click', toggleWidget);

    if (isWidgetMinimized) {
        document.getElementById('aux-widget').style.display = 'none';
        document.getElementById('minimized-box').textContent = 'Maximize Aura';
    } else {
        document.getElementById('aux-widget').style.display = 'block';
        document.getElementById('minimized-box').textContent = 'Minimize Aura';
    }

    window.addEventListener('DOMContentLoaded', () => {
        const widget = document.getElementById('aux-widget');
        const minimizedBox = document.getElementById('minimized-box');
        if (isWidgetMinimized) {
            widget.style.display = 'none';
            minimizedBox.textContent = 'Maximize Aura';
        } else {
            widget.style.display = 'block';
            minimizedBox.textContent = 'Minimize Aura';
        }
    });

    const toggleButtonHTML = `
    <button id="toggle-button" style="background: transparent; border: none; cursor: pointer; position: relative;">
        <img src="https://raw.githubusercontent.com/Mofi-l/static-images/main/down.png" style="width: 15px; height: 15px;"/>
    </button>
`;

    document.getElementById('aux-widget').innerHTML += toggleButtonHTML;

    const actionButtonsContainer = document.createElement('div');
    actionButtonsContainer.style.display = 'none';
    actionButtonsContainer.style.marginTop = '10px';
    actionButtonsContainer.id = 'action-buttons';

    actionButtonsContainer.innerHTML = `
    <img id="exportToCSVButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/download(1).png"
         alt="Download as CSV"
         title="Download as CSV"
         style="width: 40px; height: 40px; cursor: pointer; margin: 5px 2px;">

    <img id="restoreCSVButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/upload.png"
         alt="Upload edited CSV"
         title="Upload edited CSV"
         style="width: 40px; height: 40px; cursor: pointer; margin: 5px 2px;">

    <img id="exportToAWSButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/cloud-computing.png"
         alt="Export to AWS"
         title="Export to AWS"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="importFromAws"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/cloud-download-alt.png"
         alt="Import from AWS"
         title="Import from AWS"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="displayAuxDataButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/table.png"
         alt="Display AUX Data"
         title="Display AUX Data"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="viewExportHistoryButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/history.png"
         alt="View Export History"
         title="View Export History"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="clearLocalStorageButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/delete.png"
         alt="Clear Local Storage"
         title="Clear Local Storage"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="searchProjectTimeButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/search.png"
         alt="Search Project Time"
         title="Search Project Time"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="projectDetailsButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/project.png"
         alt="Daily Project Details"
         title="Daily Project Details"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="getFullDataButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/database.png"
         alt="Get Full NPT Data"
         title="Get Full NPT Data"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="dashboardButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/dashboard.png"
         alt="Dashboard"
         title="Real-time Efficieny Tracker"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="getProjectDetailsButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/project-management.png"
         alt="Project Details Card"
         title="Project Details Card"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="flashDataButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/database-table.png"
         alt="Flash Data Dashboard"
         title="Flash Data Dashboard"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="clDataManagerButton"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/data-manager.png"
         alt="CL Data Manager"
         title="CL Data Manager"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="auraGuidelines"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/guide.png"
         alt="Aura Guide"
         title="Aura Guide"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">

    <img id="reportBugImage"
         src="https://raw.githubusercontent.com/Mofi-l/static-images/main/bug.png"
         alt="Report a Bug"
         title="Report a Bug"
         style="width: 30px; height: 30px; cursor: pointer; margin: 5px 2px;">
`;

    const imagesToPreload = [
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/download(1).png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/upload.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/cloud-computing.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/attachment.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/guide.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/delete.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/bug.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/table.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/Background.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/Aura.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/search.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/database.png",
        "https://raw.githubusercontent.com/Mofi-l/static-images/main/dashboard.png",
    ];

    imagesToPreload.forEach(src => {
        const img = new Image();
        img.src = src;
    });

    document.getElementById('aux-widget').appendChild(actionButtonsContainer);
    document.getElementById('toggle-button').addEventListener('click', function() {
        const container = document.getElementById('action-buttons');
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('clDataManagerButton').addEventListener('click', async () => {
        const username = localStorage.getItem("currentUsername");
        console.log('Current username:', username); // Debug log

        try {
            const isAuthorized = await checkCLManagerAuthorization(username);
            console.log('Authorization result:', isAuthorized); // Debug log

            if (!isAuthorized) {
                showCustomAlert("You don't have permission to access the CL Data Manager");
                return;
            }

            showCLDataManagerOptions();

        } catch (error) {
            console.error('Error checking CL Manager authorization:', error);
            showCustomAlert('Failed to verify access permissions: ' + error.message);
        }
    });

    document.getElementById('exportToCSVButton').addEventListener('click', exportToCSV);
    document.getElementById('getFullDataButton').addEventListener('click', getFullData);
    document.getElementById('searchProjectTimeButton').addEventListener('click', searchProjectTime);
    document.getElementById('viewExportHistoryButton').addEventListener('click', showExportHistory);

    document.getElementById('restoreCSVButton').addEventListener('click', function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.style.display = 'none';
        input.addEventListener('change', restoreFromCSV);
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    });

    document.getElementById('exportToAWSButton').addEventListener('click', exportToAWS);
    document.getElementById('displayAuxDataButton').addEventListener('click', function() {
        const popupContainer = document.getElementById('auxTablePopup');
        if (popupContainer) {
            if (popupContainer.style.display === 'none') {
                displayAUXData(true);
            } else {
                popupContainer.style.display = 'none';
            }
        } else {
            displayAUXData(true);
        }
    });
    document.getElementById('importFromAws').addEventListener('click', importFromAws);
    document.getElementById('auraGuidelines').addEventListener('click', function() {
        window.open('https://drive.corp.amazon.com/documents/mofila@/Microsite/Aura/Microsite%20NPT%20Guidelines.pdf', '_blank');
    });
    document.getElementById('reportBugImage').addEventListener('click', function() {
        window.open('https://amazon.enterprise.slack.com/archives/C0941UXQ7DJ');
    });
    document.getElementById('clearLocalStorageButton').addEventListener('click', function () {
        showCustomConfirm('Action will clear the current NPT data. Do you want to proceed?', (userConfirmed) => {
            if (userConfirmed) {
                localStorage.clear();
                showCustomAlert('Local storage has been cleared successfully.');
            }
        });
    });
    const toggleButton = document.getElementById('toggle-button');
    toggleButton.addEventListener('click', () => {
        toggleButton.classList.toggle('active');
    });

    function makeWidgetDraggable() {
        const widget = document.getElementById('aux-widget');
        let isDragging = false;
        let offsetX, offsetY;

        widget.addEventListener('mousedown', (event) => {
            isDragging = true;
            offsetX = event.clientX - widget.getBoundingClientRect().left;
            offsetY = event.clientY - widget.getBoundingClientRect().top;
        });

        document.addEventListener('mousemove', (event) => {
            if (isDragging) {
                const newX = event.clientX - offsetX;
                const newY = event.clientY - offsetY;
                widget.style.left = newX + 'px';
                widget.style.top = newY + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    makeWidgetDraggable();
    ///////////////////////////////////////////////////////////////
    //Update Selections Body//
    function updateSelections(l1, l2, l3) {
        const auxL1 = document.getElementById('aux-l1');

        document.getElementById('aux-l1').addEventListener('change', function(event) {
            const l1Value = event.target.value;
            if (l1Value) {
                startAUXTimer(l1Names[l1Value] + ' - N/A - N/A');
            } else {
                stopAUXTimer();
            }
        });

        const auxL2 = document.getElementById('aux-l2');
        const auxL3 = document.getElementById('aux-l3');
        console.log("Updating selections to:", l1, l2, l3);
        if (auxL1) auxL1.value = l1;
        if (auxL2) {
            auxL2.value = l2;
            auxL2.dispatchEvent(new Event('change'));
        }
        if (auxL3 && l3) {
            setTimeout(() => {
                auxL3.value = l3;
                auxL3.dispatchEvent(new Event('change'));
            }, 100);
        }
    }
    ///////////////////////////////////////////////////////////////
    //Export functions//
    function addFileInput() {
        const input = document.createElement('input');
        input.type = 'file';
        input.id = 'csvFileInput';
        input.style.display = 'none';
        input.accept = '.csv';
        input.addEventListener('change', restoreFromCSV);
        document.body.appendChild(input);
    }
    ///////////////////////////////////////////////////////////////
    //Event Handling Function//
    window.handleL1Change = async function(event) {
        const l1Value = event.target.value;

        if (l1Value) {
            try {
                const loginTime = await setInitialLoginTime();
                if (loginTime) {
                    localStorage.setItem('dailyLoginTime', loginTime); // Keep local copy for UI
                }
            } catch (error) {
                console.error('Error handling login time:', error);
            }
        }

        const stateTextElement = document.querySelector('#ccp-current-state-text');
        const l1Text = stateTextElement ? stateTextElement.textContent.trim() : '';
        const l2Container = document.getElementById('aux-l2-container');
        const l3Container = document.getElementById('aux-l3-container');

        localStorage.setItem('auxL1', l1Value);
        l2Container.innerHTML = '';
        l3Container.innerHTML = '';
        l2Container.style.display = 'none';
        l3Container.style.display = 'none';

        const l2Value = document.getElementById('aux-l2') ? document.getElementById('aux-l2').value : '';

        if (l2Mapping[l1Value]) {
            let l2SelectHTML = '<select id="aux-l2" onchange="handleL2Change(event)">';
            l2SelectHTML += '<option value="">Select L2</option>';
            l2Mapping[l1Value].forEach(opt => {
                l2SelectHTML += `<option value="${opt}">${opt}</option>`;
            });
            l2SelectHTML += '</select>';
            l2Container.innerHTML = l2SelectHTML;

            document.getElementById('aux-l2').addEventListener('change', function(event) {
                const l2Value = event.target.value;
                const l1Value = document.getElementById('aux-l1').value;
                if (l2Value) {
                    if (!l3Mapping[l2Value]) {
                        handleAuxStateChange(`${l1Names[l1Value]} - ${l2Value} - N/A`);
                    }
                } else {
                    stopAUXTimer();
                }
            });

            l2Container.style.display = 'block';
        } else {
            const newAuxLabel = `${l1Names[l1Value]} - N/A - N/A`;
            handleAuxStateChange(newAuxLabel);

            if (l1Value === '' && isTabFocused && !alertShown) {
                showCustomAlert('Export your NPT to AWS');
                alertShown = true;
            } else {
                console.log('no messages');
            }

            if (l1Value) {
                localStorage.setItem('manualAUXChange', 'true');
                handleAuxStateChange(l1Names[l1Value] + ' - N/A - N/A');
                try {
                    await sendAuxUpdate();
                } catch (error) {
                    console.error('Failed to send AUX update:', error);
                }
            } else {
                stopAUXTimer();
            }

            if (l1Value !== '') {
                if (isTabFocused) {
                    showCombinedPopup(newAuxLabel, (auditData) => {
                        console.log('Audit data submitted:', auditData);
                    });
                }
            }
        }
        localStorage.setItem('previousAux', l1Value === 'Conduct Project' ? 'CP' : '');
    };

    window.handleL2Change = async function(event) {
        const l2Value = event.target.value;
        const l3Container = document.getElementById('aux-l3-container');
        const l1Value = document.getElementById('aux-l1').value;

        localStorage.setItem('auxL2', l2Value);
        l3Container.innerHTML = '';
        l3Container.style.display = 'none';

        if (l3Mapping[l2Value]) {
            let l3SelectHTML = '<select id="aux-l3" onchange="handleL3Change(event)">';
            l3SelectHTML += '<option value="">Select L3</option>';
            l3Mapping[l2Value].forEach(opt => {
                l3SelectHTML += `<option value="${opt}">${opt}</option>`;
            });
            l3SelectHTML += '</select>';
            l3Container.innerHTML = l3SelectHTML;

            document.getElementById('aux-l3').addEventListener('change', function(event) {
                const l3Value = event.target.value;
                const l2Value = document.getElementById('aux-l2').value;
                const l1Value = document.getElementById('aux-l1').value;
                if (l3Value) {
                    handleAuxStateChange(`${l1Names[l1Value]} - ${l2Value} - ${l3Value}`);
                } else {
                    stopAUXTimer();
                }
            });

            l3Container.style.display = 'block';
        } else {
            const newAuxLabel = `${l1Names[l1Value]} - ${l2Value} - N/A`;
            handleAuxStateChange(newAuxLabel);
            try {
                await sendAuxUpdate();
            } catch (error) {
                console.error('Failed to send AUX update:', error);
            }
        }

        const newAuxLabel = `${l1Names[l1Value]} - ${l2Value} - N/A`;
        updateTimerDisplay(newAuxLabel, 0);

        if (l2Value !== '' && !l3Mapping[l2Value]) {
            if (isTabFocused) {
                showCombinedPopup(newAuxLabel, (auditData) => {
                    console.log('Audit data submitted:', auditData);
                });
            }
        }

        localStorage.setItem('previousAux', l2Value === 'Conduct Project' ? 'CP' : '');
    };

    window.handleL3Change = async function(event) {
        const l3Value = event.target.value;
        const l2Value = document.getElementById('aux-l2').value;
        const l1Value = document.getElementById('aux-l1').value;

        console.log('L3 Change - Selected values:', {
            l1: l1Value,
            l2: l2Value,
            l3: l3Value
        });

        localStorage.setItem('auxL3', l3Value);
        const PreviousAux = localStorage.getItem('PreviousAux');

        if (l3Value !== '') {
            const previousAuxLabel = `${l1Names[l1Value]} - ${l2Value} - ${l3Value}`;
            localStorage.setItem('previousAuxLabel', previousAuxLabel);
            const newAuxLabel = `${l1Names[l1Value]} - ${l2Value} - ${l3Value}`;

            const currentState = JSON.parse(localStorage.getItem('auxState')) || {};
            if (currentState.auxLabel !== newAuxLabel) {
                handleAuxStateChange(newAuxLabel);
            }

            try {
                await sendAuxUpdate();
            } catch (error) {
                console.error('Failed to send AUX update:', error);
            }

            if (isTabFocused) {
                showCombinedPopup(newAuxLabel, (auditData) => {
                    console.log('Audit data submitted:', auditData);
                });
            }
        }

        // Store current AUX as previous for next comparison
        localStorage.setItem('previousAux', l3Value);
        localStorage.setItem('previousAuxLabel', `${l1Names[l1Value]} - ${l2Value} - ${l3Value}`);
        const startTime = JSON.parse(localStorage.getItem('auxState'))?.startTime || Date.now();
        const endTime = new Date();
        const timeSpent = endTime - new Date(startTime);

        const formattedTimeSpent = formatTime(timeSpent);
        const newAuxLabel = `${l1Names[l1Value]} - ${l2Value} - ${l3Value}`;
        updateTimerDisplay(newAuxLabel, timeSpent);

        const currentState = JSON.parse(localStorage.getItem('auxState')) || {};
        if (currentState.auxLabel === newAuxLabel) {
            saveAUXData({
                auxLabel: newAuxLabel,
                timeSpent: timeSpent,
                date: formatDate(new Date())
            });
        }

        lastSelectedL1 = l1Value;
        lastSelectedL2 = l2Value;
        lastSelectedL3 = l3Value;
        lastL3Selection = l3Value;
        finalSelectionMade = true;

        if (finalLayerSelected()) {
            const auxLabel = `${l1Names[l1Value]} - ${l2Value} - ${l3Value}`;
            const timeSpent = calculateTimeSpent(startTime);
            saveAUXData({ auxLabel, timeSpent });
            exportToCSV();
            exportToAWS();
        }

        localStorage.setItem('previousAux', l3Value === 'Conduct Project' ? 'CP' : '');
    };

    // Add helper function for final layer check
    function finalLayerSelected() {
        const auxL1Value = document.getElementById('aux-l1').value;
        const auxL2Value = document.getElementById('aux-l2')?.value;
        const auxL3Value = document.getElementById('aux-l3')?.value;
        return auxL1Value && auxL2Value && auxL3Value && !l3Mapping[auxL2Value];
    }
    ///////////////////////////////////////////////////////////////
    //POP-UP Function//
    async function showCombinedPopup(auxLabel, callback) {
        if (!isTabFocused) return;
        console.log('showCombinedPopup function called');

        const auxData = JSON.parse(localStorage.getItem('auxData')) || [];
        const previousEntry = auxData[auxData.length - 1];

        // Check if current L1 is Microsite Project Work
        const isMicrositeWork = auxLabel.startsWith('Microsite Project Work');

        // Check if previous AUX was strictly "Conduct Project"
        // Check if previous entry exists and get its L2 and L3
        const previousL2L3 = previousEntry && previousEntry.auxLabel ?
              previousEntry.auxLabel.split(' - ').slice(1) : [];

        const wasPreviousDpmOrDocReview = previousL2L3[0] === 'DPM Request' ||
              previousL2L3[0] === 'Document Review';

        const wasPreviousL3ConductProject = previousL2L3[1] === 'Conduct Project';

        // Check two conditions:
        // 1. Was previous AUX strictly "Conduct Project" (existing logic)
        const wasPreviousConductProject = previousEntry &&
              previousEntry.auxLabel &&
              previousEntry.auxLabel.split(' - ').some(part =>
                                                       part.trim() === 'Conduct Project' &&
                                                       !part.trim().includes('Non Conduct Project')
                                                      );

        // 2. Was previous combination DPM/Document Review with Conduct Project
        const wasPreviousDpmDocReviewConductProject = wasPreviousDpmOrDocReview &&
              wasPreviousL3ConductProject;

        // Combined logic: Enable audit count if previous was Conduct Project
        // BUT disable if previous was DPM/Document Review with Conduct Project
        const enableAuditCount = wasPreviousConductProject &&
              !wasPreviousDpmDocReviewConductProject;

        const currentLabel = auxLabel.toLowerCase();

        // Create HTML only for relevant fields
        let fieldsHTML = '';

        // Show project title field only for Microsite Project Work
        if (isMicrositeWork) {
            fieldsHTML += `
            <div class="input-field">
                <label for="projectTitle">Project Title *</label>
                <input type="text" id="projectTitle" placeholder="Enter project title" required>
            </div>
        `;
        }

        // Show 'Are you PL?' only for Microsite Project Work
        if (isMicrositeWork) {
            fieldsHTML += `
            <div class="radio-group">
                <label class="radio-label">Are you the PL? *</label>
                <div class="radio-options">
                    <label class="radio-option">
                        <input type="radio" name="areYouPL" value="Yes" required>
                        <span class="radio-label">Yes</span>
                    </label>
                    <label class="radio-option">
                        <input type="radio" name="areYouPL" value="No" required>
                        <span class="radio-label">No</span>
                    </label>
                    <label class="radio-option">
                        <input type="radio" name="areYouPL" value="N/A" required>
                        <span class="radio-label">N/A</span>
                    </label>
                </div>
            </div>
        `;
        }

        // Always show comment field
        fieldsHTML += `
        <div class="input-field">
            <label for="comment-text">Comment</label>
            <textarea id="comment-text" rows="4" placeholder="Enter your comment here..." required></textarea>
        </div>
    `;

        // Show audit counts field only after Conduct Project
        if (wasPreviousConductProject) {
            fieldsHTML += `
            <div class="input-field">
                <label for="relatedAudits">Audit Counts *</label>
                <input type="number" id="relatedAudits" placeholder="Enter number of audits" required>
            </div>
        `;
        }

        // Create and add popup to document
        const popup = document.createElement('div');
        popup.id = 'combined-popup';
        popup.innerHTML = `
        <div class="popup-content">
            <h2>Enter Data</h2>
            <div class="input-container">
                ${fieldsHTML}
            </div>
            <div class="button-group">
                <button type="button" id="submit-btn" class="popup-button">Submit</button>
                <button type="button" id="cancel-btn" class="popup-button">Cancel</button>
            </div>
        </div>
    `;

        document.body.appendChild(popup);

        const styles = document.createElement('style');
        styles.textContent = `
            #combined-popup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            z-index: 10001;
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

        .input-field label::after {
            content: ' *';
            color: #ff4757;
        }

        .input-field input:invalid {
            border-color: #ff4757;
        }

        .input-field input:invalid:focus {
            border-color: #ff4757;
            box-shadow: 0 0 0 3px rgba(255, 71, 87, 0.2);
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

        /* Add styles for disabled fields */
        input:disabled,
        input[type="radio"]:disabled + span {
            opacity: 0.6;
            cursor: not-allowed;
            background-color: #f5f5f5;
        }
    `;

        document.head.appendChild(styles);

        // Get all required elements
        const submitBtn = document.getElementById('submit-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        const commentInput = document.getElementById('comment-text');
        const projectTitleInput = document.getElementById('projectTitle');
        const relatedAuditsInput = document.getElementById('relatedAudits');

        // Validation function
        function validateForm() {
            const comment = commentInput.value.trim();
            if (!comment) return false;

            if (isMicrositeWork) {
                const projectTitle = projectTitleInput?.value.trim();
                const areYouPL = document.querySelector('input[name="areYouPL"]:checked')?.value;
                if (!projectTitle || !areYouPL) return false;

                // Validate project title format
                if (!isValidProjectTitle(projectTitle)) return false;
            }

            if (wasPreviousConductProject && relatedAuditsInput) {
                const auditCount = relatedAuditsInput.value.trim();
                if (!auditCount || isNaN(auditCount) || parseInt(auditCount) < 0) return false;
            }

            return true;
        }

        // Helper function to validate project title format
        function isValidProjectTitle(title) {
            if (/^\d+$/.test(title)) return true;
            if (/^WF-\d+$/.test(title)) return true;
            if (/^Microsite-\d+$/.test(title)) return true;
            if (/^CL-.*$/.test(title)) return true;
            if (/^QA-.*$/.test(title)) return true;
            return false;
        }

        // Add event listeners for validation
        const inputs = [commentInput];
        if (isMicrositeWork && projectTitleInput) inputs.push(projectTitleInput);
        if (wasPreviousConductProject && relatedAuditsInput) inputs.push(relatedAuditsInput);

        function updateSubmitButton() {
            const isValid = validateForm();
            submitBtn.disabled = !isValid;
            submitBtn.style.opacity = isValid ? '1' : '0.6';
        }

        inputs.forEach(input => {
            if (input) {
                input.addEventListener('input', updateSubmitButton);
            }
        });

        if (isMicrositeWork) {
            const radioButtons = document.querySelectorAll('input[name="areYouPL"]');
            radioButtons.forEach(radio => {
                radio.addEventListener('change', updateSubmitButton);
            });
        }

        // Submit handler
        submitBtn.addEventListener('click', () => {
            if (validateForm()) {
                const data = {
                    comment: commentInput.value.trim(),
                    projectTitle: projectTitleInput ? projectTitleInput.value.trim() : 'N/A',
                    areYouPL: document.querySelector('input[name="areYouPL"]:checked')?.value || 'N/A',
                    relatedAudits: relatedAuditsInput ? relatedAuditsInput.value.trim() : 'N/A'
                };

                // Save to localStorage
                localStorage.setItem('comment-' + auxLabel, data.comment);
                localStorage.setItem('projectTitle-' + auxLabel, data.projectTitle);
                localStorage.setItem('areYouPL-' + auxLabel, data.areYouPL);
                localStorage.setItem('relatedAudits-' + auxLabel, data.relatedAudits);

                popup.remove();
                callback(data);
            }
        });

        // Cancel handler
        cancelBtn.addEventListener('click', () => {
            popup.remove();
        });

        // Initial validation
        updateSubmitButton();
    }

    // Helper function to extract aux values from auxLabel
    function getAuxValues(auxLabel) {
        if (!auxLabel || typeof auxLabel !== 'string') {
            return {
                auxL1Value: '',
                auxL3Value: ''
            };
        }

        const parts = auxLabel.split(' - ');
        return {
            auxL1Value: parts[0] || '',
            auxL3Value: parts[2] || ''
        };
    }

    function submitCombinedData(auxLabel, callback) {
        const submitBtn = document.getElementById('submit-btn');

        // Get all form inputs
        const comment = document.getElementById('comment-text')?.value || 'N/A';
        const projectTitle = document.getElementById('projectTitle')?.value || 'N/A';
        const relatedAudits = document.getElementById('relatedAudits')?.value || 'N/A';
        const selectedRadio = document.querySelector('input[name="areYouPL"]:checked');
        const areYouPL = selectedRadio ? selectedRadio.value : 'N/A';

        // Save to localStorage immediately
        localStorage.setItem('comment-' + auxLabel, comment);
        localStorage.setItem('areYouPL-' + auxLabel, areYouPL);
        localStorage.setItem('projectTitle-' + auxLabel, projectTitle);
        localStorage.setItem('relatedAudits-' + auxLabel, relatedAudits);

        // Check if the current AUX is Microsite Project Work
        const isMicrositeWork = auxLabel.startsWith('Microsite Project Work');

        // Validate inputs based on conditions
        function validateInputs() {
            // Always require comment
            if (comment.trim() === '') {
                showCustomAlert('Comment is required');
                return false;
            }

            // For Microsite Project Work, require all fields
            if (isMicrositeWork) {
                if (!projectTitle || projectTitle === 'N/A') {
                    showCustomAlert('Project Title is required for Microsite Project Work');
                    return false;
                }

                if (!areYouPL || areYouPL === 'N/A') {
                    showCustomAlert('Please select if you are the PL for Microsite Project Work');
                    return false;
                }

                // Validate project title format
                if (!isValidProjectTitle(projectTitle)) {
                    showCustomAlert('Invalid project title format. Must be numbers only, WF-numbers, Microsite-numbers, CL-anything, or QA-anything');
                    return false;
                }

                // Validate audit count if previous AUX was Conduct Project
                const previousAux = localStorage.getItem('previousAux');
                if (previousAux === 'CP' && (!relatedAudits || relatedAudits === 'N/A')) {
                    showCustomAlert('Audit count is required after Conduct Project');
                    return false;
                }

                // Additional validation for numeric audit count
                if (relatedAudits !== 'N/A' && !/^\d+$/.test(relatedAudits)) {
                    showCustomAlert('Audit count must be a valid number');
                    return false;
                }
            }

            return true;
        }

        // Add input event listeners to all required fields
        const inputs = [
            document.getElementById('comment-text'),
            ...(isMicrositeWork ? [document.getElementById('projectTitle')] : [])
        ];

        const radioButtons = document.querySelectorAll('input[name="areYouPL"]');

        function updateSubmitButton() {
            submitBtn.disabled = !validateInputs();
            submitBtn.style.opacity = submitBtn.disabled ? '0.6' : '1';
        }

        // Add event listeners
        inputs.forEach(input => {
            if (input) {
                input.addEventListener('input', updateSubmitButton);
            }
        });

        if (isMicrositeWork) {
            radioButtons.forEach(radio => {
                radio.addEventListener('change', updateSubmitButton);
            });
        }

        // Initial button state
        updateSubmitButton();

        // Submit handler
        submitBtn.onclick = () => {
            if (validateInputs()) {
                const popup = document.getElementById('combined-popup');
                if (popup) {
                    popup.remove();
                }

                callback({
                    comment,
                    areYouPL,
                    projectTitle,
                    relatedAudits
                });
            }
        };

        // Helper function to validate project title format
        function isValidProjectTitle(title) {
            if (isMicrositeWork) {
                return (
                    /^\d+$/.test(title) || // Numbers only
                    /^WF-\d+$/.test(title) || // WF-numbers
                    /^Microsite-\d+$/.test(title) || // Microsite-numbers
                    /^CL-.*$/.test(title) || // CL-anything
                    /^QA-.*$/.test(title) // QA-anything
                );
            }
            return true; // For non-Microsite work, any format is valid
        }
    }
    ///////////////////////////////////////////////////////////////
    //Project details Quip alternative
    //Project details Form
    const combiOptions = [
        { id: 'Combi1', time: '6am - 3pm' },
        { id: 'Combi2', time: '7am - 6pm' },
        { id: 'Combi3', time: '8am - 7pm' },
        { id: 'Combi4', time: '9am - 7pm' },
        { id: 'Combi5', time: '10am - 9pm' },
        { id: 'Combi6', time: '11am - 10pm' },
        { id: 'Combi7', time: '12pm - 11pm' },
        { id: 'Combi8', time: '1pm - 12am' }
    ];

    function showProjectDetailsForm() {
        const popup = document.createElement('div');
        popup.className = 'project-details-popup';
        popup.innerHTML = `
        <div class="popup-content">
            <h2>Project Details</h2>
            <!-- Remove the form element from here -->
           <div class="form-group">
                <label>Select your Combi</label>
                <select id="combi-select" required>
                    <option value="">Select Combi</option>
                    ${combiOptions.map(combi =>
                                       `<option value="${combi.id}">${combi.id} ${combi.time}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Active projects with SIM number (Mention PL/PC)</label>
                <input type="text" id="active-projects" required>
            </div>
            <div class="form-group">
                <label>Back up POC, if PL</label>
                <input type="text" id="backup-poc">
            </div>
            <div class="form-group">
                <label>Project hours for the day</label>
                <input type="number" id="project-hours" required>
            </div>
            <div class="form-group">
                <label>Parked/yet to begin projects</label>
                <input type="text" id="parked-projects">
            </div>
            <div class="form-group">
                <label>ETA of active projects (comma separated, TBD if not decided)</label>
                <input type="text" id="project-eta" required>
            </div>
            <div class="form-group">
                <label>Comments</label>
                <textarea id="project-comments"></textarea>
            </div>
            <div class="button-group">
                <button type="button" id="submit-project-details">Submit</button>
                <button type="button" id="cancel-project-details">Cancel</button>
            </div>
        </div>
    `;
        document.body.appendChild(popup);

        // Add click event listeners
        document.getElementById('submit-project-details').addEventListener('click', handleProjectDetailsSubmit);
        document.getElementById('cancel-project-details').addEventListener('click', closeProjectDetailsForm);
    }

    async function handleProjectDetailsSubmit() {
        try {

            // Show loading indicator
            const loadingIndicator = createLoadingIndicator();
            document.body.appendChild(loadingIndicator);

            await loadAwsSdk();
            await loadCognitoSdk();

            const credentials = await showAuthModal();
            if (!credentials) {
                throw new Error('Authentication cancelled');
            }

            const token = await AuthService.ensureAuthenticated();
            await configureAWS(token);
            if (!token) {
                throw new Error('Authentication failed');
            }

            // Configure AWS with the authenticated credentials
            // After authentication succeeds, configure AWS:
            AWS.config.update({
                region: 'eu-north-1',
                credentials: new AWS.CognitoIdentityCredentials({
                    IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                    Logins: {
                        'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                    }
                })
            });

            // Wait for credentials to be initialized:
            await new Promise((resolve, reject) => {
                AWS.config.credentials.get(err => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            const s3 = new AWS.S3();
            const bucketName = 'project-details-bucket';

            // Create the data object
            const data = {
                date: new Date().toISOString(),
                username: localStorage.getItem("currentUsername"),
                combi: document.getElementById('combi-select').value,
                activeProjects: document.getElementById('active-projects').value,
                backupPOC: document.getElementById('backup-poc').value,
                projectHours: document.getElementById('project-hours').value,
                parkedProjects: document.getElementById('parked-projects').value,
                projectETA: document.getElementById('project-eta').value,
                comments: document.getElementById('project-comments').value
            };

            // Validate Combi selection
            if (!data.combi) {
                throw new Error('Please select your Combi');
            }

            // Validate required fields
            if (!data.activeProjects || !data.projectHours || !data.projectETA) {
                throw new Error('Please fill in all required fields');
            }

            const currentDate = new Date().toISOString().split('T')[0];
            const filename = `project_details_${data.username}_${currentDate}_${Date.now()}.json`;

            await s3.putObject({
                Bucket: bucketName,
                Key: filename,
                Body: JSON.stringify(data),
                ContentType: 'application/json',
                CacheControl: 'no-cache, no-store, must-revalidate'
            }).promise();

            showCustomAlert('Project details saved successfully!');
            closeProjectDetailsForm();

        } catch (error) {
            console.error('Error in handleProjectDetailsSubmit:', error);

            // Handle specific error cases
            if (error.message === 'Authentication cancelled') {
                showCustomAlert('Operation cancelled');
            } else if (error.code === 'NoSuchBucket') {
                showCustomAlert('Error: Project details bucket not found. Please contact administrator.');
            } else if (error.code === 'NetworkingError') {
                showCustomAlert('Network error. Please check your connection and try again.');
            } else {
                showCustomAlert(error.message || 'Error saving project details. Please try again.');
            }

        } finally {
            // Remove loading indicator if it exists
            const loadingIndicator = document.querySelector('.loading-indicator');
            if (loadingIndicator) {
                document.body.removeChild(loadingIndicator);
            }
        }
    }

    function closeProjectDetailsForm() {
        const popup = document.querySelector('.project-details-popup');
        if (popup) {
            popup.remove();
        }
    }

    const projectDetailsStyles = `
.project-details-popup {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    backdrop-filter: blur(5px);
}

.project-details-popup .popup-content {
    background: #1a1a1a;
    padding: 2rem;
    border-radius: 16px;
    width: 90%;
    max-width: 500px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.project-details-popup h2 {
    color: #ffffff;
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
    font-weight: 600;
}

.project-details-popup .form-group {
    margin-bottom: 1.5rem;
}

.project-details-popup .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: #e0e0e0;
    font-size: 0.9rem;
    font-weight: 500;
}

.project-details-popup .form-group input,
.project-details-popup .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #333;
    border-radius: 8px;
    background: #2d2d2d;
    color: #ffffff;
    font-size: 0.9rem;
    transition: all 0.3s ease;
}

.project-details-popup .form-group input:focus,
.project-details-popup .form-group textarea:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
}

.project-details-popup .form-group textarea {
    min-height: 100px;
    resize: vertical;
}

.project-details-popup .button-group {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 2rem;
}

.project-details-popup .button-group button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.3s ease;
}

.project-details-popup .button-group button[type="button"]#submit-project-details {
    background: #4f46e5;
    color: white;
}

.project-details-popup .button-group button[type="button"]#submit-project-details:hover {
    background: #4338ca;
}

.project-details-popup .button-group button[type="button"]#cancel-project-details {
    background: #374151;
    color: white;
}

.project-details-popup .button-group button[type="button"]#cancel-project-details:hover {
    background: #1f2937;
}

.project-details-popup input::-webkit-outer-spin-button,
.project-details-popup input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.project-details-popup .auth-modal {
    z-index: 10004 !important;
}

/* For Firefox */
.project-details-popup input[type=number] {
    -moz-appearance: textfield;
}

    .project-details-popup select {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #333;
        border-radius: 8px;
        background: #2d2d2d;
        color: #ffffff;
        font-size: 0.9rem;
        transition: all 0.3s ease;
    }

    .project-details-popup select:focus {
        outline: none;
        border-color: #4f46e5;
        box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
    }

    .project-details-popup select option {
        background: #2d2d2d;
        color: #ffffff;
        padding: 8px;
    }
`;

    document.head.appendChild(document.createElement('style')).textContent = projectDetailsStyles;

    //Project details Dashboard
    document.getElementById('projectDetailsButton').addEventListener('click', function() {
        showCustomAlert('This option is no longer available')
    });

    //Get project details
    async function showProjectDashboard() {
        try {
            // Clear any existing dashboard
            const existingDashboard = document.querySelector('.project-dashboard');
            if (existingDashboard) {
                existingDashboard.remove();
            }

            const username = localStorage.getItem("currentUsername");

            await injectAuthStyles();
            await loadAwsSdk();
            await loadCognitoSDK();

            // Try to use stored credentials first
            let credentials = {
                username: localStorage.getItem('lastAuthUsername'),
                password: localStorage.getItem('lastAuthPassword')
            };

            // Only show auth modal if no stored credentials
            if (!credentials.username || !credentials.password) {
                credentials = await showAuthModal();
                if (credentials) {
                    localStorage.setItem('lastAuthUsername', credentials.username);
                    localStorage.setItem('lastAuthPassword', credentials.password);
                }
            }

            if (!credentials) {
                throw new Error('Authentication cancelled');
            }

            const token = await AuthService.ensureAuthenticated();
            await configureAWS(token);
            if (!token) {
                throw new Error('Authentication failed');
            }

            // Configure AWS
            AWS.config.update({
                region: 'eu-north-1',
                credentials: new AWS.CognitoIdentityCredentials({
                    IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                    Logins: {
                        'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                    }
                })
            });

            // Wait for credentials to be initialized
            await new Promise((resolve, reject) => {
                AWS.config.credentials.get(err => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            const loadingIndicator = createLoadingIndicator();
            document.body.appendChild(loadingIndicator);

            try {
                const s3 = new AWS.S3();
                const bucketName = 'project-details-bucket';
                const prefix = 'project_details_';
                const projectData = [];

                const listedObjects = await s3.listObjectsV2({
                    Bucket: bucketName,
                    Prefix: prefix
                }).promise();

                console.log(`Found ${listedObjects.Contents.length} project detail files`);

                for (const item of listedObjects.Contents) {
                    try {
                        const fileData = await s3.getObject({
                            Bucket: bucketName,
                            Key: item.Key,
                            RequestPayer: 'requester',
                            ResponseCacheControl: 'no-cache'
                        }).promise();

                        const content = JSON.parse(fileData.Body.toString('utf-8'));
                        if (Array.isArray(content)) {
                            projectData.push(...content);
                        } else {
                            projectData.push(content);
                        }
                    } catch (fileError) {
                        console.error(`Error processing file ${item.Key}:`, fileError);
                        continue;
                    }
                }

                const dashboard = document.createElement('div');
                dashboard.className = 'project-dashboard';

                const dashboardHTML = `
                <div class="dashboard-content">
                    <div class="dashboard-sidebar">
                        <div class="sidebar-header">
                            <h2>Project Hub</h2>
                        </div>
                        <div class="sidebar-filters">
                            <div class="search-container">
                                <i class="fas fa-search"></i>
                                <input type="text" class="search-input" placeholder="Search projects...">
                            </div>
                            <div class="filter-group">
                                <h3>Time Range</h3>
                                <select class="date-filter">
                                    <option value="all">All Time</option>
                                    <option value="today" selected>Today</option>
                                    <option value="week">This Week</option>
                                    <option value="month">This Month</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <h3>Quick Stats</h3>
                                <div class="stats-grid">
                                    <div class="stat-card">
                                        <span class="stat-value">${projectData.length}</span>
                                        <span class="stat-label">Total Updates</span>
                                    </div>
                                    <div class="stat-card">
                                        <span class="stat-value">${new Set(projectData.map(p => p.username)).size}</span>
                                        <span class="stat-label">Active Users</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="dashboard-main">
                        <div class="main-header">
                            <div class="header-title">
                                <h1>Project Details</h1>
                                <span class="subtitle">Real-time project updates from team members</span>
                            </div>
                            <div class="header-actions">
                                <button class="action-btn refresh-btn">
                                    <i class="fas fa-sync-alt"></i>
                                    <span>Refresh</span>
                                </button>
                                <button class="action-btn download-btn">
                                    <i class="fas fa-download"></i>
                                    <span>Export</span>
                                </button>
                                <button class="action-btn close-btn">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        <div class="projects-container">
                            <div class="project-grid">
                                ${projectData.map(project => `
                                    <div class="project-card">
                                        <div class="card-header">
                                            <div class="user-info">
                                                <div class="avatar-wrapper">
                                                    <img src="https://badgephotos.corp.amazon.com/?uid=${project.username}"
                                                         alt="User avatar"
                                                         class="user-avatar"
                                                         onerror="this.src='default-avatar.png'">
                                                    <span class="status-indicator"></span>
                                                </div>
                                                <div class="user-details">
                                                    <span class="username">${project.username}</span>
                                                    <span class="date">
                                                        <i class="far fa-clock"></i>
                                                        ${new Date(project.date).toLocaleString()}
                                                    </span>
                                                    <span class="combi-info">
                                                        <i class="fas fa-clock"></i>
                                                        ${project.combi ? getCombiTimeRange(project.combi) : 'No Combi selected'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div class="card-actions">
                                                <div class="dropdown">
                                                    <button class="card-menu-btn">
                                                        <i class="fas fa-ellipsis-v"></i>
                                                    </button>
                                                    <div class="dropdown-content">
                                                        ${project.username === username ?
                                                  `<a href="#" class="edit-option" data-project-id="${project.date}">Edit</a>
                                                             <a href="#" class="delete-option" data-project-id="${project.date}">Delete</a>`
                                                            : ''}
                                                        <a href="#" class="view-option" data-project-id="${project.date}">View Details</a>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="card-content">
                                            <div class="info-grid">
                                                <div class="info-item">
                                                    <i class="fas fa-clock"></i>
                                                    <div class="info-details">
                                                        <span class="info-label">Combi</span>
                                                        <span class="info-value">${project.combi || 'N/A'}</span>
                                                    </div>

                                                </div>
                                                <div class="info-item">
                                                    <i class="fas fa-tasks"></i>
                                                    <div class="info-details">
                                                        <span class="info-label">Active Projects</span>
                                                        <span class="info-value">${project.activeProjects}</span>
                                                    </div>
                                                </div>
                                                <div class="info-item">
                                                    <i class="fas fa-user-shield"></i>
                                                    <div class="info-details">
                                                        <span class="info-label">Backup POC</span>
                                                        <span class="info-value">${project.backupPOC || 'N/A'}</span>
                                                    </div>
                                                </div>
                                                <div class="info-item">
                                                    <i class="fas fa-clock"></i>
                                                    <div class="info-details">
                                                        <span class="info-label">Hours Today</span>
                                                        <span class="info-value">${project.projectHours}h</span>
                                                    </div>
                                                </div>
                                                <div class="info-item">
                                                    <i class="fas fa-pause-circle"></i>
                                                    <div class="info-details">
                                                        <span class="info-label">Parked Projects</span>
                                                        <span class="info-value">${project.parkedProjects || 'None'}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="project-eta">
                                                <span class="eta-label">Project ETA</span>
                                                <span class="eta-value">${project.projectETA}</span>
                                            </div>

                                            ${project.comments ? `
                                                <div class="project-comments">
                                                    <span class="comments-label">Comments</span>
                                                    <p class="comments-value">${project.comments}</p>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;

                dashboard.innerHTML = dashboardHTML;

                // Add styles
                const styles = document.createElement('style');
                styles.textContent = `
        /* Include FontAwesome CSS */
        @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

        .project-dashboard {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            backdrop-filter: blur(10px);
        }

        .dashboard-content {
            display: flex;
            background: #141414;
            width: 95%;
            height: 90vh;
            max-width: 1800px;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        }

        .dashboard-sidebar {
            width: 300px;
            background: #1a1a1a;
            border-right: 1px solid rgba(255, 255, 255, 0.08);
            padding: 2rem;
        }

        .sidebar-header h2 {
            font-size: 1.5rem;
            margin-bottom: 2rem;
            color: #fff;
        }

        .search-container {
            position: relative;
            margin-bottom: 2rem;
        }

        .search-container i {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: rgba(255, 255, 255, 0.5);
        }

        .search-input {
            width: 100%;
            padding: 12px 12px 12px 40px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            color: ffffff;
        }

        .search-input::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }

    .user-details {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .combi-info {
        color: #a8dfee;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .combi-info i {
        color: #6c5ce7;
        font-size: 0.8rem;
    }

        .user-details .username {
            color: #ffffff; /* Changed to white */
            font-weight: 600;
            font-size: 1.1rem;
        }

        .user-details .date {
            color: #a8dfee; /* Changed to white */
            font-size: 0.9rem;
        }

        .filter-group {
            margin-bottom: 2rem;
        }

        .filter-group h3 {
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 1rem;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.05);
            padding: 1rem;
            border-radius: 12px;
            text-align: center;
        }

        .stat-value {
            display: block;
            font-size: 1.5rem;
            font-weight: bold;
            color: #fff;
            margin-bottom: 0.5rem;
        }

        .stat-label {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.6);
        }

        .dashboard-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 2rem;
        }

        .main-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
        }

        .header-title h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
            color: #fff;
        }

        .subtitle {
            color: rgba(255, 255, 255, 0.6);
        }

        .header-actions {
            display: flex;
            gap: 1rem;
        }

        .action-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.25rem;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s ease;
        }

        .refresh-btn {
            background: #2563eb;
            color: white;
        }

        .download-btn {
            background: #059669;
            color: white;
        }

        .close-btn {
            background: #dc2626;
            color: white;
            padding: 0.75rem;
        }

        .projects-container {
            flex: 1;
            overflow-y: auto;
            padding-right: 1rem;
        }

        .project-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 1.5rem;
        }

        .project-card {
            background: rgba(255, 255, 255, 0.03);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.06);
            overflow: hidden;
        }

        .card-header {
            padding: 1.5rem;
            background: rgba(255, 255, 255, 0.02);
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .avatar-wrapper {
            position: relative;
            width: 48px;
            height: 48px;
        }

        .user-avatar {
            width: 100%;
            height: 100%;
            border-radius: 12px;
            object-fit: cover;
        }

        .status-indicator {
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 12px;
            height: 12px;
            background: #10B981;
            border: 2px solid #141414;
            border-radius: 50%;
        }

        .card-content {
            padding: 1.5rem;
        }

        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            margin-bottom: 1.5rem;
        }

        .info-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 12px;
        }

        .info-item i {
            font-size: 1.2rem;
            color: rgba(255, 255, 255, 0.7);
        }

        .info-details {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }

        .info-label {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.6);
        }

        .info-value {
            font-size: 0.95rem;
            color: #fff;
        }

        .project-eta,
        .project-comments {
            margin-top: 1.5rem;
            padding: 1rem;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 12px;
        }

        .eta-label,
        .comments-label {
            display: block;
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 0.5rem;
        }

        .eta-value,
        .comments-value {
            color: #fff;
            line-height: 1.5;
        }

        /* Scrollbar Styling */
        .projects-container::-webkit-scrollbar {
            width: 8px;
        }

        .projects-container::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.02);
            border-radius: 4px;
        }

        .projects-container::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }

        .projects-container::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
        }

.pause-status-indicator {
    transition: all 0.3s ease;
    z-index: 10001;
}

.pause-status-indicator:hover {
    transform: scale(1.2);
}

.edit-btn {
    background: none;
    border: none;
    color: #4f46e5;
    cursor: pointer;
    padding: 5px;
    margin-right: 10px;
    transition: color 0.3s ease;
}

.edit-btn:hover {
    color: #4338ca;
}

.project-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10002;
}

.modal-content {
    background: #1a1a1a;
    padding: 2rem;
    border-radius: 16px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-content h2 {
    color: #ffffff;
    margin-bottom: 1.5rem;
}

.modal-content p {
    color: #e0e0e0;
    margin-bottom: 0.5rem;
}

.modal-content .button-group {
    margin-top: 1.5rem;
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
}

.dropdown {
    position: relative;
    display: inline-block;
}

.dropdown-content {
    display: none;
    position: absolute;
    right: 0;
    background-color: #1a1a1a;
    min-width: 120px;
    box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
    z-index: 1;
    border-radius: 8px;
}

.dropdown-content a {
    color: #ffffff;
    padding: 12px 16px;
    text-decoration: none;
    display: block;
}

.dropdown-content a:hover {
    background-color: #2c2c2c;
}

.dropdown:hover .dropdown-content {
    display: block;
}
//////////
.project-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    backdrop-filter: blur(5px);
}

.modal-content {
    background-color: #1e1e1e;
    color: #e0e0e0;
    padding: 2rem;
    border-radius: 12px;
    width: 90%;
    max-width: 500px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    border: 1px solid #333;
}

.modal-content h2 {
    color: #ffffff;
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
    font-weight: 600;
}

.form-group {
    margin-bottom: 1.5rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: #bbb;
    font-size: 0.9rem;
}

.form-group input,
.form-group select,
.form-group textarea {
    width: 100%;
    padding: 0.75rem;
    background-color: #2a2a2a;
    border: 1px solid #444;
    border-radius: 6px;
    color: #fff;
    font-size: 1rem;
    transition: border-color 0.3s, box-shadow 0.3s;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
    outline: none;
    border-color: #4a90e2;
    box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.3);
}

.form-group select {
    appearance: none;
    backgrounound-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M10.293 3.293L6 7.586 1.707 3.293A1 1 0 00.293 4.707l5 5a1 1 0 001.414 0l5-5a1 1 0 10-1.414-1.414z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 1rem center;
    padding-right: 2.5rem;
}

.form-group textarea {
    min-height: 100px;
    resize: vertical;
}

.button-group {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 2rem;
}

.button-group button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.3s, transform 0.1s;
}

#update-project {
    background-color: #4a90e2;
    color: #fff;
}

#update-project:hover {
    background-color: #3a7bc8;
}

#close-modal {
    background-color: #444;
    color: #fff;
}

#close-modal:hover {
    background-color: #555;
}

.delete-option {
    color: #dc3545 !important;
}

.delete-option:hover {
    background-color: rgba(220, 53, 69, 0.1) !important;
}

.button-group button:active {
    transform: translateY(1px);
}

/* For Webkit browsers like Chrome/Safari */
.form-group input[type="number"]::-webkit-inner-spin-button,
.form-group input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

/* For Firefox */
.form-group input[type="number"] {
    -moz-appearance: textfield;
}

@media (max-width: 600px) {
    .modal-content {
        padding: 1.5rem;
    }

    .form-group {
        margin-bottom: 1rem;
    }

    .button-group {
        flex-direction: column;
    }

    .button-group button {
        width: 100%;
    }
}

`;

                document.head.appendChild(styles);

                document.body.appendChild(dashboard);

                // Add event listeners
                const searchInput = dashboard.querySelector('.search-input');
                const dateFilter = dashboard.querySelector('.date-filter');
                const projectCards = dashboard.querySelectorAll('.project-card');
                const refreshBtn = dashboard.querySelector('.refresh-btn');
                const downloadBtn = dashboard.querySelector('.download-btn');
                const closeBtn = dashboard.querySelector('.close-btn');
                const editOptions = dashboard.querySelectorAll('.edit-option');
                const viewOptions = dashboard.querySelectorAll('.view-option');

                // Search functionality
                searchInput.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    projectCards.forEach(card => {
                        const content = card.textContent.toLowerCase();
                        card.style.display = content.includes(searchTerm) ? 'block' : 'none';
                    });
                });

                // Date filter functionality
                dateFilter.addEventListener('change', (e) => {
                    const filterValue = e.target.value;
                    const now = new Date();

                    projectCards.forEach(card => {
                        const dateStr = card.querySelector('.date').textContent.trim();
                        const cardDate = new Date(dateStr);

                        let show = true;
                        if (filterValue === 'today') {
                            show = cardDate.toDateString() === now.toDateString();
                        } else if (filterValue === 'week') {
                            const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                            show = cardDate >= weekAgo;
                        } else if (filterValue === 'month') {
                            show = cardDate.getMonth() === now.getMonth() &&
                                cardDate.getFullYear() === now.getFullYear();
                        }

                        card.style.display = show ? 'block' : 'none';
                    });

                    updateFilteredStats(projectData, filterValue);
                });

                // Refresh button
                refreshBtn.addEventListener('click', async () => {
                    dashboard.remove();
                    await showProjectDashboard();
                });

                // Download button
                downloadBtn.addEventListener('click', () => {
                    downloadProjectDetails(projectData);
                });

                // Close button
                closeBtn.addEventListener('click', () => {
                    dashboard.remove();
                });

                // Edit options
                editOptions.forEach(option => {
                    option.addEventListener('click', (e) => {
                        e.preventDefault();
                        const projectId = e.target.getAttribute('data-project-id');
                        editProjectDetails(projectId, projectData);
                    });
                });

                // View options
                viewOptions.forEach(option => {
                    option.addEventListener('click', (e) => {
                        e.preventDefault();
                        const projectId = e.target.getAttribute('data-project-id');
                        viewProjectDetails(projectId, projectData);
                    });
                });

                const deleteOptions = dashboard.querySelectorAll('.delete-option');
                deleteOptions.forEach(option => {
                    option.addEventListener('click', (e) => {
                        e.preventDefault();
                        const projectId = e.target.getAttribute('data-project-id');
                        deleteProjectDetails(projectId);
                    });
                });

                // Filter for today's projects initially
                dateFilter.value = 'today';
                dateFilter.dispatchEvent(new Event('change'));

            } finally {
                document.body.removeChild(loadingIndicator);
            }

        } catch (error) {
            console.error('Error in showProjectDashboard:', error);
            showCustomAlert('Failed to load project dashboard');
        }
    }

    // Helper function to get Combi time range
    function getCombiTimeRange(combiId) {
        const combiMap = {
            'Combi1': '6am - 3pm',
            'Combi2': '7am - 6pm',
            'Combi3': '8am - 7pm',
            'Combi4': '9am - 7pm',
            'Combi5': '10am - 9pm',
            'Combi6': '11am - 10pm',
            'Combi7': '12pm - 11pm',
            'Combi8': '1pm - 12am'
        };
        return combiMap[combiId] || 'Invalid Combi';
    }

    // Helper function to update stats based on filtered data
    function updateFilteredStats(data, filterValue) {
        const now = new Date();
        const filteredData = data.filter(project => {
            const projectDate = new Date(project.date);
            if (filterValue === 'today') {
                return projectDate.toDateString() === now.toDateString();
            } else if (filterValue === 'week') {
                const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                return projectDate >= weekAgo;
            } else if (filterValue === 'month') {
                return projectDate.getMonth() === now.getMonth() &&
                    projectDate.getFullYear() === now.getFullYear();
            }
            return true;
        });

        const statsContainer = document.querySelector('.stats-grid');
        if (statsContainer) {
            statsContainer.innerHTML = `
            <div class="stat-card">
                <span class="stat-value">${filteredData.length}</span>
                <span class="stat-label">Updates</span>
            </div>
            <div class="stat-card">
                <span class="stat-value">${new Set(filteredData.map(p => p.username)).size}</span>
                <span class="stat-label">Users</span>
            </div>
        `;
        }
    }

    function filterTodayProjects(data) {
        const today = new Date().toISOString().split('T')[0];
        return data.filter(project => {
            const projectDate = new Date(project.date).toISOString().split('T')[0];
            return projectDate === today;
        });
    }

    function editProjectDetails(projectId, allData) {
        const project = allData.find(p => p.date === projectId);
        if (!project) {
            showCustomAlert('Project not found');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'project-modal';
        modal.innerHTML = `
        <div class="modal-content">
            <h2>Edit Project Details</h2>
            <div class="form-group">
                <label>Select your Combi</label>
                <select id="edit-combi-select" required>
                    <option value="">Select Combi</option>
                    ${combiOptions.map(combi =>
                                       `<option value="${combi.id}" ${project.combi === combi.id ? 'selected' : ''}>
                            ${combi.id} ${combi.time}
                        </option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Active projects with SIM number</label>
                   <input type="text" id="edit-active-projects" value="${project.activeProjects}" required>
            </div>
            <div class="form-group">
                <label>Back up POC, if PL</label>
                <input type="text" id="edit-backup-poc" value="${project.backupPOC || ''}">
            </div>
            <div class="form-group">
                <label>Project hours for the day</label>
                <input type="number" id="edit-project-hours" value="${project.projectHours}" required>
            </div>
            <div class="form-group">
                <label>Parked/yet to begin projects</label>
                <input type="text" id="edit-parked-projects" value="${project.parkedProjects || ''}">
            </div>
            <div class="form-group">
                <label>ETA of active projects</label>
                <input type="text" id="edit-project-eta" value="${project.projectETA}" required>
            </div>
            <div class="form-group">
                <label>Comments</label>
                <textarea id="edit-project-comments">${project.comments || ''}</textarea>
            </div>
            <div class="button-group">
                <button type="button" id="update-project">Update</button>
                <button type="button" id="close-modal">Cancel</button>
            </div>
        </div>
    `;

        document.body.appendChild(modal);

        document.getElementById('update-project').addEventListener('click', () => updateProjectDetails(projectId));
        document.getElementById('close-modal').addEventListener('click', closeModal);
    }

    function viewProjectDetails(projectId, allData) {
        const project = allData.find(p => p.date === projectId);
        if (!project) {
            showCustomAlert('Project not found');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'project-modal';
        modal.innerHTML = `
        <div class="modal-content">
            <h2>Project Details</h2>
            <p><strong>Date:</strong> ${new Date(project.date).toLocaleString()}</p>
            <p><strong>Username:</strong> ${project.username}</p>
            <p><strong>Combi:</strong> ${project.combi}</p>
            <p><strong>Active Projects:</strong> ${project.activeProjects}</p>
            <p><strong>Backup POC:</strong> ${project.backupPOC || 'N/A'}</p>
            <p><strong>Project Hours:</strong> ${project.projectHours}</p>
            <p><strong>Parked Projects:</strong> ${project.parkedProjects || 'None'}</p>
            <p><strong>Project ETA:</strong> ${project.projectETA}</p>
            <p><strong>Comments:</strong> ${project.comments || 'None'}</p>
            <div class="button-group">
                <button type="button" id="close-modal">Close</button>
            </div>
        </div>
    `;

        document.body.appendChild(modal);

        document.getElementById('close-modal').addEventListener('click', closeModal);
    }

    async function deleteProjectDetails(projectId) {
        try {
            showCustomConfirm('Are you sure you want to delete this project details?', async (confirmed) => {
                if (!confirmed) return;

                // Get current credentials or authenticate
                let token;
                try {
                    const credentials = await showAuthModal();
                    if (!credentials) throw new Error('Authentication cancelled');
                    token = await AuthService.ensureAuthenticated();
                    await configureAWS(token);
                } catch (error) {
                    showCustomAlert('Authentication failed');
                    return;
                }

                // Configure AWS
                AWS.config.update({
                    region: 'eu-north-1',
                    credentials: new AWS.CognitoIdentityCredentials({
                        IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                        Logins: {
                            'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                        }
                    })
                });

                // Initialize S3
                const s3 = new AWS.S3();
                const bucketName = 'project-details-bucket';
                const dateStr = new Date(projectId).toISOString().split('T')[0];
                const username = localStorage.getItem("currentUsername");
                const timestamp = new Date(projectId).getTime();
                const key = `project_details_${username}_${dateStr}_${timestamp}.json`;

                // Delete the file
                await s3.deleteObject({
                    Bucket: bucketName,
                    Key: key
                }).promise();

                showCustomAlert('Project details deleted successfully');

                // Refresh the dashboard
                const dashboard = document.querySelector('.project-dashboard');
                if (dashboard) {
                    dashboard.remove();
                    await showProjectDashboard();
                }
            });
        } catch (error) {
            console.error('Error deleting project details:', error);
            showCustomAlert('Failed to delete project details');
        }
    }

    function closeModal() {
        const modal = document.querySelector('.project-modal');
        if (modal) {
            modal.remove();
        }
    }

    async function updateProjectDetails(projectId) {
        try {
            // Get the current user's credentials and authenticate
            await loadAwsSdk();
            const credentials = await showAuthModal();

            if (!credentials) {
                throw new Error('Authentication cancelled');
            }

            const token = await AuthService.ensureAuthenticated();
            await configureAWS(token);
            if (!token) {
                throw new Error('Authentication failed');
            }

            // Configure AWS with the authenticated credentials
            AWS.config.update({
                region: 'eu-north-1',
                credentials: new AWS.CognitoIdentityCredentials({
                    IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                    Logins: {
                        'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                    }
                })
            });

            // Wait for credentials to be initialized
            await new Promise((resolve, reject) => {
                AWS.config.credentials.get(err => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Use current date and time instead of original projectId
            const currentDate = new Date();
            const currentISOString = currentDate.toISOString();

            const updatedData = {
                date: currentISOString,
                username: localStorage.getItem("currentUsername"),
                combi: document.getElementById('edit-combi-select').value,
                activeProjects: document.getElementById('edit-active-projects').value,
                backupPOC: document.getElementById('edit-backup-poc').value,
                projectHours: document.getElementById('edit-project-hours').value,
                parkedProjects: document.getElementById('edit-parked-projects').value,
                projectETA: document.getElementById('edit-project-eta').value,
                comments: document.getElementById('edit-project-comments').value
            };

            // Validate required fields
            if (!updatedData.combi || !updatedData.activeProjects || !updatedData.projectHours || !updatedData.projectETA) {
                throw new Error('Please fill in all required fields');
            }

            const s3 = new AWS.S3();
            const bucketName = 'project-details-bucket';

            // Create a unique key for the updated file
            const dateStr = new Date(projectId).toISOString().split('T')[0];
            const timestamp = new Date(projectId).getTime();
            const key = `project_details_${updatedData.username}_${dateStr}_${timestamp}.json`;

            // First, delete the old file
            try {
                await s3.deleteObject({
                    Bucket: bucketName,
                    Key: key
                }).promise();
            } catch (error) {
                console.log('No existing file to delete or error deleting:', error);
            }

            // Then save the updated data
            await s3.putObject({
                Bucket: bucketName,
                Key: key,
                Body: JSON.stringify(updatedData),
                ContentType: 'application/json',
                CacheControl: 'no-cache, no-store, must-revalidate'
            }).promise();

            showCustomAlert('Project details updated successfully!');
            closeModal();

            // Force a complete refresh of the dashboard
            const dashboard = document.querySelector('.project-dashboard');
            if (dashboard) {
                dashboard.remove();
            }

            // Small delay to ensure the old dashboard is removed
            setTimeout(async () => {
                await showProjectDashboard();
            }, 100);

        } catch (error) {
            console.error('Error updating project details:', error);
            showCustomAlert(error.message || 'Error updating project details');
        }
    }

    function closeEditForm() {
        const popup = document.querySelector('.project-details-popup');
        if (popup) {
            popup.remove();
        }
    }

    function downloadProjectDetails(data) {
        const headers = [
            'Date',
            'Username',
            'Combi',
            'Active Projects',
            'Backup POC',
            'Project Hours',
            'Parked Projects',
            'Project ETA',
            'Comments'
        ];

        const csvContent = [
            headers.join(','),
            ...data.map(project => [
                new Date(project.date).toISOString(),
                project.username,
                `"${project.combi || ''}"`,
                `"${project.activeProjects}"`,
                `"${project.backupPOC || ''}"`,
                project.projectHours,
                `"${project.parkedProjects || ''}"`,
                `"${project.projectETA}"`,
                `"${(project.comments || '').replace(/"/g, '""')}"`,
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `project_details_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    document.getElementById('getProjectDetailsButton').addEventListener('click', function() {
        showCustomAlert('This option is no longer available')
    });
    ///////////////////////////////////////////////////////
    //Real-time efficiency tracker
    let dashboardUpdateInterval;
    let dashboardAnimationFrame;
    let lastUpdates = [];
    let currentFilter = 'all';
    let currentSearchTerm = '';

    // Add this to the setInitialLoginTime function to debug
    async function setInitialLoginTime() {
        try {
            await loadAwsSdk();
            await loadCognitoSdk();

            const today = new Date().toISOString().split('T')[0];
            const username = localStorage.getItem("currentUsername");

            // Format current time in local timezone
            const localLoginTime = new Date().toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });

            // Get AWS credentials
            const token = await AuthService.ensureAuthenticated();
            await configureAWS(token);

            const s3 = new AWS.S3();
            const key = `login-times/${username}_${today}.json`;

            try {
                // Try to get existing login time for today
                const existingData = await s3.getObject({
                    Bucket: 'real-time-databucket',
                    Key: key
                }).promise();

                const data = JSON.parse(existingData.Body.toString());

                // If we have existing login data but no unique ID yet, generate one
                if (!data.uniqueId) {
                    await generateDailyUniqueId();
                }

                return data.loginTime; // Return existing login time

            } catch (error) {
                if (error.code === 'NoSuchKey') {
                    // No existing login time, set new one AND generate unique ID
                    const loginData = {
                        username: username,
                        date: today,
                        loginTime: localLoginTime
                    };

                    await s3.putObject({
                        Bucket: 'real-time-databucket',
                        Key: key,
                        Body: JSON.stringify(loginData),
                        ContentType: 'application/json',
                        CacheControl: 'no-cache, no-store, must-revalidate'
                    }).promise();

                    // Generate unique ID for the new login
                    await generateDailyUniqueId();

                    localStorage.setItem('dailyLoginTime', localLoginTime);
                    return localLoginTime;
                }
                throw error;
            }
        } catch (error) {
            console.error('Error setting initial login time:', error);
            return null;
        }
    }

    async function setLogoutTime(auxLabel) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const username = localStorage.getItem("currentUsername");

            // Only proceed if the AUX label indicates offline status
            if (auxLabel.toLowerCase().includes('offline')) {
                const logoutTime = new Date().toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });

                // Store in localStorage
                localStorage.setItem('dailyLogoutTime', logoutTime);
                localStorage.setItem('lastLogoutDate', today);

                // Get AWS credentials and configure
                const token = await AuthService.ensureAuthenticated();
                await configureAWS(token);
                const s3 = new AWS.S3();

                // Prepare the data
                const logoutData = {
                    username: username,
                    date: today,
                    logoutTime: logoutTime,
                    auxLabel: auxLabel
                };

                // Store in S3
                await s3.putObject({
                    Bucket: 'real-time-databucket',
                    Key: `logout-times/${username}_${today}.json`,
                    Body: JSON.stringify(logoutData),
                    ContentType: 'application/json'
                }).promise();

                console.log('Logout time stored successfully:', logoutTime);
            }
        } catch (error) {
            console.error('Error storing logout time:', error);
        }
    }

    function clearDailyTimes() {
        const today = new Date().toISOString().split('T')[0];
        const lastDate = localStorage.getItem('lastActiveDate');

        if (lastDate !== today) {
            localStorage.removeItem('firstAuxUpdateTime');
            localStorage.removeItem('offlineTime');
            localStorage.setItem('lastActiveDate', today);
        }
    }

    function calculateTotalSteppingAwayTime(username) {
        try {
            // Get saved AUX data from localStorage
            const auxData = JSON.parse(localStorage.getItem('auxData')) || [];

            // Filter for Stepping Away entries for the current user and current date
            const today = new Date().toISOString().split('T')[0];
            const steppingAwayEntries = auxData.filter(entry =>
                                                       entry.username === username &&
                                                       entry.auxLabel.includes('Stepping Away') &&
                                                       entry.date.includes(today)
                                                      );

            // Sum up all Stepping Away time
            const totalTime = steppingAwayEntries.reduce((total, entry) => {
                // Convert HH:MM:SS to milliseconds
                if (typeof entry.timeSpent === 'string' && entry.timeSpent.includes(':')) {
                    const [hours, minutes, seconds] = entry.timeSpent.split(':').map(Number);
                    return total + ((hours * 3600 + minutes * 60 + seconds) * 1000);
                }
                // If timeSpent is already in milliseconds
                return total + (parseInt(entry.timeSpent) || 0);
            }, 0);

            return totalTime;
        } catch (error) {
            console.error('Error calculating total stepping away time:', error);
            return 0;
        }
    }

    async function showDashboard() {
        try {
            // First load both SDKs
            await loadAwsSdk();
            await loadCognitoSdk();

            const token = await AuthService.ensureAuthenticated();
            if (!token) {
                throw new Error('Authentication failed');
            }

            if (token) {
                // Configure AWS with the token
                await configureAWS(token);

                // Only initialize dashboard after AWS is configured
                await initializeDashboard();
            }

        } catch (error) {
            console.error('Dashboard initialization error:', error);
            showCustomAlert('Failed to initialize dashboard: ' + error.message);
        }
    }


    async function startDashboardUpdates() {
        try {
            await updateDashboardData(true); // Initial update

            // Use requestAnimationFrame for smooth updates
            function updateLoop() {
                if (document.getElementById('aux-dashboard')) {
                    updateDashboardTimers();
                    requestAnimationFrame(updateLoop);
                }
            }

            requestAnimationFrame(updateLoop);

            // Keep the interval for data refresh, but not for timer updates
            dashboardUpdateInterval = setInterval(() => updateDashboardData(false), 30000);

        } catch (error) {
            console.error('Failed to start dashboard updates:', error);
            showCustomAlert('Failed to initialize dashboard updates');
        }
    }

    function stopDashboardUpdates() {
        if (dashboardAnimationFrame) {
            cancelAnimationFrame(dashboardAnimationFrame);
            dashboardAnimationFrame = null;
        }
        if (dashboardUpdateInterval) {
            clearInterval(dashboardUpdateInterval);
            dashboardUpdateInterval = null;
        }
    }

    // Helper function to update AWS credentials
    async function updateAWSCredentials(token) {
        AWS.config.update({
            region: 'eu-north-1',
            credentials: new AWS.CognitoIdentityCredentials({
                IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                Logins: {
                    'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                }
            })
        });

        // Wait for credentials to be refreshed
        return new Promise((resolve, reject) => {
            AWS.config.credentials.get(err => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // Helper function to calculate user status
    function calculateUserStatus(lastUpdateTime, auxLabel, isPaused) {
        // Add debugging
        console.log('Calculating status for:', { lastUpdateTime, auxLabel, isPaused });

        // If the AUX state is paused
        if (isPaused) {
            return 'paused';
        }

        // Convert auxLabel to lowercase for consistent comparison
        auxLabel = (auxLabel || '').toLowerCase();

        // Handle stepping away status
        if (auxLabel.includes('stepping away')) {
            return 'paused';
        }

        // Handle offline status
        if (auxLabel.includes('offline')) {
            return 'inactive';
        }

        // Handle undefined or missing AUX label
        if (auxLabel.includes('undefined') || !auxLabel) {
            return 'inactive';
        }

        // Handle break status
        if (auxLabel.includes('on break')) {
            return 'away';
        }

        // Default to active if no other conditions are met
        return 'active';
    }

    async function initializeDashboard() {
        try {
            // Load required SDKs
            await loadAwsSdk();
            await loadCognitoSdk();

            let dashboard = document.getElementById('aux-dashboard');
            if (dashboard) {
                stopDashboardUpdates();
                dashboard.remove();
                return;
            }

            // Create dashboard container
            dashboard = document.createElement('div');
            dashboard.id = 'aux-dashboard';

            // Add dashboard styles
            const styles = `
             /* Base Dashboard Container */
             #aux-dashboard {
                 position: fixed;
                 top: 50%;
                 left: 50%;
                 transform: translate(-50%, -50%);
                 width: 90%;
                 max-width: 1200px;
                 height: 85vh;
                 background: linear-gradient(145deg, rgba(0, 0, 0, 0.95), rgba(20, 20, 30, 0.95));
                 border-radius: 15px;
                 padding: 25px;
                 z-index: 10003;
                 color: white;
                 overflow: hidden;
                 box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                 backdrop-filter: blur(10px);
                 border: 1px solid rgba(255, 255, 255, 0.1);
                 font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
             }

             /* Header Styles */
             .dashboard-header {
                 display: flex;
                 justify-content: space-between;
                 align-items: center;
                 margin-bottom: 20px;
                 padding-bottom: 15px;
                 border-bottom: 1px solid rgba(255, 255, 255, 0.1);
             }

             .dashboard-title {
                 font-size: 24px;
                 font-weight: 600;
                 color: white;
                 margin: 0;
             }

             .pause-status-indicator {
                 transition: all 0.3s ease;
                 z-index: 10001;
             }

             .pause-status-indicator:hover {
                 transform: scale(1.2);
             }

             /* Search Container */
             .search-container {
                 margin-bottom: 20px;
                 padding: 20px;
                 display: flex;
                 gap: 20px;
                 align-items: center;
                 background: rgba(20, 20, 30, 0.7);
                 border-radius: 12px;
                 border: 1px solid rgba(255, 255, 255, 0.05);
                 box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
             }

             /* Search Input */
             .search-input {
                 flex: 1;
                 height: 40px;
                 padding: 0 16px;
                 background: rgba(30, 30, 40, 0.95);
                 border: 1px solid rgba(255, 255, 255, 0.1);
                 border-radius: 8px;
                 color: #ffffff;
                 font-size: 14px;
                 transition: all 0.3s ease;
             }

             .search-input:hover {
                 border-color: rgba(255, 255, 255, 0.2);
                 background: rgba(40, 40, 50, 0.95);
             }

             .search-input:focus {
                 outline: none;
                 border-color: #6c5ce7;
                 background: rgba(40, 40, 50, 0.95);
                 box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.2);
             }

             .search-input::placeholder {
                 color: rgba(255, 255, 255, 0.4);
             }

                 .status-paused {
                     background-color: #FFA500;
                     box-shadow: 0 0 8px rgba(255, 165, 0, 0.5);
                 }

                 /* Update status indicators to include paused state */
                 .status-indicator {
                     display: inline-block;
                     width: 8px;
                     height: 8px;
                     border-radius: 50%;
                     margin-right: 10px;
                 }

                 .status-active {
                     background-color: #4CAF50;
                     box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
                 }

                 .status-away {
                     background-color: #FFC107;
                     box-shadow: 0 0 8px rgba(255, 193, 7, 0.5);
                 }

                 .status-inactive {
                     background-color: #F44336;
                     box-shadow: 0 0 8px rgba(244, 67, 54, 0.5);
                 }

                 .status-paused {
                     background-color: #FFA500;
                     box-shadow: 0 0 8px rgba(255, 165, 0, 0.5);
                 }

             /* Status Filter */
             .status-filter {
                 min-width: 150px;
                 height: 40px;
                 padding: 0 16px;
                 background: rgba(30, 30, 40, 0.95);
                 border: 1px solid rgba(255, 255, 255, 0.1);
                 border-radius: 8px;
                 color: #ffffff;
                 font-size: 14px;
                 cursor: pointer;
                 transition: all 0.3s ease;
                 -webkit-appearance: none;
                 -moz-appearance: none;
                 appearance: none;
                 background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='rgba(255, 255, 255, 0.5)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
                 background-repeat: no-repeat;
                 background-position: right 8px center;
                 background-size: 16px;
                 padding-right: 32px;
             }

             .status-filter:hover {
                 border-color: rgba(255, 255, 255, 0.2);
                 background-color: rgba(40, 40, 50, 0.95);
             }

             .status-filter:focus {
                 outline: none;
                 border-color: #6c5ce7;
                 background-color: rgba(40, 40, 50, 0.95);
                 box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.2);
             }

             /* Status Filter Options */
             .status-filter option {
                 background: #1a1a1a;
                 color: #ffffff;
                 padding: 12px;
                 font-size: 14px;
             }

             /* Dashboard Content */
             .dashboard-content {
                 height: calc(100% - 140px);
                 overflow-y: auto;
                 padding-right: 8px;
             }

             /* Dashboard Table */
             .dashboard-table {
                 width: 100%;
                 border-collapse: separate;
                 border-spacing: 0;
                 background: rgba(20, 20, 30, 0.7);
                 border-radius: 12px;
                 overflow: hidden;
             }

             .dashboard-table th {
                 padding: 16px;
                 text-align: left;
                 background: rgba(30, 30, 40, 0.95);
                 border-bottom: 2px solid rgba(255, 255, 255, 0.1);
                 font-weight: 600;
                 color: rgba(255, 255, 255, 0.9);
                 font-size: 14px;
             }

             .dashboard-table td {
                 padding: 14px 16px;
                 border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                 color: rgba(255, 255, 255, 0.8);
                 font-size: 14px;
             }

             /* Status Indicators */
             .status-indicator {
                 display: inline-block;
                 width: 8px;
                 height: 8px;
                 border-radius: 50%;
                 margin-right: 10px;
             }

             .status-active {
                 background-color: #4CAF50;
                 box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
             }

             .status-away {
                 background-color: #FFC107;
                 box-shadow: 0 0 8px rgba(255, 193, 7, 0.5);
             }

             .status-inactive {
                 background-color: #F44336;
                 box-shadow: 0 0 8px rgba(244, 67, 54, 0.5);
             }

             .status-paused {
                 background-color: #FFA500;
                 box-shadow: 0 0 8px rgba(255, 165, 0, 0.5);
             }

             /* Scrollbar Styling */
             .dashboard-content::-webkit-scrollbar {
                 width: 8px;
             }

             .dashboard-content::-webkit-scrollbar-track {
                 background: rgba(255, 255, 255, 0.05);
                 border-radius: 4px;
             }

             .dashboard-content::-webkit-scrollbar-thumb {
                 background: rgba(255, 255, 255, 0.1);
                 border-radius: 4px;
             }

             .dashboard-content::-webkit-scrollbar-thumb:hover {
                 background: rgba(255, 255, 255, 0.15);
             }

             /* Dashboard Controls */
             .dashboard-controls {
                 display: flex;
                 gap: 15px;
                 align-items: center;
             }

             .dashboard-button {
                 background: rgba(255, 255, 255, 0.1);
                 border: none;
                 color: white;
                 width: 32px;
                 height: 32px;
                 border-radius: 50%;
                 cursor: pointer;
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 font-size: 18px;
                 transition: all 0.3s ease;
             }

             .dashboard-button:hover {
                 background: rgba(255, 255, 255, 0.2);
                 transform: scale(1.1);
             }

             /* Responsive Design */
             @media (max-width: 768px) {
                 .search-container {
                     flex-direction: column;
                     gap: 10px;
                 }

                 .search-input,
                 .status-filter {
                     width: 100%;
                 }

                 .dashboard-content {
                     height: calc(100% - 180px);
                 }
             }
             `;

            const styleSheet = document.createElement('style');
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);

            // Create dashboard structure
            dashboard.innerHTML = `
                     <div class="dashboard-header">
                         <h2 class="dashboard-title">Real-time AUX Dashboard</h2>
                         <div class="dashboard-controls">
                             <button class="dashboard-button refresh-btn" title="Refresh Data">↻</button>
                             <button class="dashboard-button download-btn" title="Download CSV">⬇️</button>
                             <button class="dashboard-button close-btn">×</button>
                         </div>
                     </div>
                     <div class="search-container">
                         <input type="text" class="search-input" placeholder="Search by username...">
                         <select class="status-filter">
                             <option value="all">All Status</option>
                             <option value="active">Active</option>
                             <option value="away">Away</option>
                             <option value="inactive">Inactive</option>
                             <option value="paused">Paused</option>
                         </select>
                     </div>
                     <div class="dashboard-content">
                         <table class="dashboard-table">
                             <thead>
                                 <tr>
                                     <th>Username</th>
                                     <th>Current AUX</th>
                                     <th>Time</th>
                                     <th>Status</th>
                                     <th>Login Time</th>
                                     <th>Logout Time</th>
                                     <th>Export Time</th>
                                 </tr>
                             </thead>
                             <tbody id="dashboard-data"></tbody>
                         </table>
                     </div>
                 `;

            document.body.appendChild(dashboard);

            // Add event listeners
            const refreshBtn = dashboard.querySelector('.refresh-btn');
            const closeBtn = dashboard.querySelector('.close-btn');
            const searchInput = dashboard.querySelector('.search-input');
            const statusFilter = dashboard.querySelector('.status-filter');

            refreshBtn.onclick = () => {
                refreshBtn.style.transform = 'rotate(360deg)';
                updateDashboardData(true);
                setTimeout(() => {
                    refreshBtn.style.transform = 'rotate(0deg)';
                }, 1000);
            };

            const downloadBtn = dashboard.querySelector('.download-btn');
            downloadBtn.onclick = () => {
                const csvContent = generateCSV(lastUpdates);
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                if (link.download !== undefined) {
                    const url = URL.createObjectURL(blob);
                    link.setAttribute('href', url);
                    link.setAttribute('download', 'aux_dashboard_data.csv');
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            };

            closeBtn.onclick = () => {
                stopDashboardUpdates();
                dashboard.remove();
            };

            searchInput.addEventListener('input', () => filterDashboard());
            statusFilter.addEventListener('change', () => filterDashboard());

            // Start updates
            startDashboardUpdates();

            // Add escape key listener
            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape' && document.getElementById('aux-dashboard')) {
                    stopDashboardUpdates();
                    dashboard.remove();
                }
            });

            // Initial data load
            await updateDashboardData(true);

        } catch (error) {
            console.error('Dashboard initialization error:', error);
            showCustomAlert('Failed to initialize dashboard: ' + error.message);
        }

        const unsubscribe = AuxUpdateEventSystem.subscribe((eventType, data) => {
            if (eventType === 'auxUpdate') {
                updateDashboardData(true);
            }
        });

        // Cleanup on dashboard close
        return () => unsubscribe();
    }

    function generateCSV(updates) {
        const headers = ['Date', 'Username', 'Login Time', 'Paused Time', 'Logout Time', 'Total Time'];
        const rows = updates.map(update => {
            const date = new Date(update.loginTime).toLocaleDateString();
            const loginTime = new Date(update.loginTime).toLocaleTimeString();
            const logoutTime = update.logoutTime ? new Date(update.logoutTime).toLocaleTimeString() : 'Active';
            const pausedTime = formatTime(update.totalPauseDuration || 0);
            const totalTime = formatTime(
                (update.logoutTime ? new Date(update.logoutTime) : new Date()) - new Date(update.loginTime) - (update.totalPauseDuration || 0)
            );
            return [date, update.username, loginTime, pausedTime, logoutTime, totalTime];
        });

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    let isAuthenticationInProgress = false;

    async function sendAuxUpdate() {
        if (isAuthenticationInProgress) {
            console.log('Authentication already in progress');
            return;
        }
        try {
            await loadAwsSdk();
            await loadCognitoSdk();
            isAuthenticationInProgress = true;
            const currentState = JSON.parse(localStorage.getItem('auxState'));
            console.log('Attempting to send AUX update:', currentState);
            if (!currentState) {
                console.log('No current AUX state to send');
                return;
            }

            // Calculate total Stepping Away time
            const totalSteppingAwayTime = parseInt(localStorage.getItem('totalSteppingAwayTime') || '0');
            const currentSteppingAwayTime = currentState.auxLabel.includes('Stepping Away') ?
                  (new Date().getTime() - currentState.startTime) : 0;

            let username = localStorage.getItem('lastAuthUsername');
            let password = localStorage.getItem('lastAuthPassword');

            // Only show auth modal if no stored credentials
            if (!username || !password) {
                console.log('No stored credentials, requesting authentication...');
                const credentials = await showAuthModal();
                if (!credentials) {
                    throw new Error('Authentication cancelled');
                }
                username = credentials.username;
                password = credentials.password;
                localStorage.setItem('lastAuthUsername', username);
                localStorage.setItem('lastAuthPassword', password);
            }

            console.log('Authenticating with AWS...');
            const token = await AuthService.ensureAuthenticated();
            await configureAWS(token);

            // Configure AWS with retries
            await retryOperation(async () => {
                AWS.config.update({
                    region: 'eu-north-1',
                    credentials: new AWS.CognitoIdentityCredentials({
                        IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                        Logins: {
                            'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                        }
                    })
                });

                // Wait for credentials to refresh
                return new Promise((resolve, reject) => {
                    AWS.config.credentials.get(err => {
                        if (err) {
                            console.error('Error getting AWS credentials:', err);
                            reject(err);
                        } else {
                            console.log('AWS credentials successfully obtained');
                            resolve();
                        }
                    });
                });
            }, 3);

            const s3 = new AWS.S3();
            const today = new Date().toISOString().split('T')[0];
            const initialLoginTime = localStorage.getItem('dailyLoginTime');

            // Try to get existing data from AWS first
            let existingData;
            try {
                const response = await s3.getObject({
                    Bucket: 'real-time-databucket',
                    Key: `aux-realtime/${username}.json`
            }).promise();
                existingData = JSON.parse(response.Body.toString());
                console.log('Retrieved existing data:', existingData);
            } catch (error) {
                if (error.code !== 'NoSuchKey') {
                    console.error('Error retrieving existing data:', error);
                }
            }

            // Determine the correct login time
            let loginTime;
            if (existingData && existingData.date === today) {
                loginTime = existingData.loginTime;
            } else {
                // Use setInitialLoginTime to ensure consistency
                setInitialLoginTime();
                loginTime = localStorage.getItem('dailyLoginTime');
            }

            // Validate current state
            if (!validateAuxData(currentState)) {
                throw new Error('Invalid AUX state data');
            }

            // Prepare the data object with explicit pause state information
            const data = {
                username: username,
                auxLabel: currentState.auxLabel,
                startTime: currentState.startTime,
                lastUpdate: new Date().toISOString(),
                isPaused: currentState.isPaused || false,
                pauseTime: currentState.pauseTime || null,
                totalSteppingAwayTime: totalSteppingAwayTime + currentSteppingAwayTime,
                loginTime: initialLoginTime,
                logoutTime: currentState.auxLabel.toLowerCase().includes('offline') ?
                localStorage.getItem('dailyLogoutTime') || new Date().toISOString() : null,
                lastAuxUpdate: new Date().toISOString(),
                date: today,
                status: calculateUserStatus(
                    new Date().getTime(),
                    currentState.auxLabel,
                    currentState.isPaused
                )
            };

            console.log('Sending data to S3:', data);

            // Send data to S3 with retry mechanism
            await retryOperation(async () => {
                await s3.putObject({
                    Bucket: 'real-time-databucket',
                    Key: `aux-realtime/${username}.json`,
                    Body: JSON.stringify(data),
                    ContentType: 'application/json',
                    CacheControl: 'no-cache, no-store, must-revalidate'
                }).promise();
            }, 3);

            console.log('Successfully sent data to S3:', data);

            // Add small delay to ensure data propagation
            await new Promise(resolve => setTimeout(resolve, 500));

            // Update dashboard if it's open
            if (document.getElementById('aux-dashboard')) {
                await updateDashboardData(true);
            }

            // Update local storage with the latest state
            localStorage.setItem('auxState', JSON.stringify({
                ...currentState,
                lastUpdate: data.lastUpdate,
                status: data.status
            }));

            // Broadcast the update
            const updateEvent = new CustomEvent('auxStateUpdate', {
                detail: {
                    type: 'update',
                    data: data
                }
            });
            window.dispatchEvent(updateEvent);

            // Emit update event for tracking
            AuxUpdateEventSystem.emit('auxUpdate', {
                timestamp: new Date().toISOString(),
                username: username,
                status: data.status
            });

            return true;

        } catch (error) {
            console.error('Error sending AUX update:', error);
            if (error.code === 'CredentialsError' || error.message.includes('NetworkingError')) {
                try {
                    await sendAuxUpdateWithRetry(3);
                } catch (retryError) {
                    console.error('All retries failed:', retryError);
                    localStorage.removeItem('lastAuthUsername');
                    localStorage.removeItem('lastAuthPassword');
                    throw new Error('Failed to send AUX update after multiple attempts');
                }
            } else {
                throw error;
            }
        } finally {
            isAuthenticationInProgress = false;
        }
    }

    function validateAuxData(state) {
        if (!state) return false;
        const requiredFields = ['auxLabel', 'startTime'];
        return requiredFields.every(field => state.hasOwnProperty(field) && state[field] !== null);
    }

    const AuxUpdateEventSystem = {
        listeners: new Set(),

        emit(eventType, data) {
            this.listeners.forEach(listener => listener(eventType, data));
        },

        subscribe(listener) {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        }
    };

    async function updateDashboardData(isImmediateUpdate = false) {
        try {
            console.log('Starting dashboard update...', isImmediateUpdate ? '(Immediate update)' : '');

            // First, ensure AWS SDK is loaded
            await loadAwsSdk();

            const token = await AuthService.ensureAuthenticated();
            if (!token) {
                throw new Error('Authentication failed');
            }
            await configureAWS(token);

            // Configure AWS with the token
            AWS.config.update({
                region: 'eu-north-1',
                credentials: new AWS.CognitoIdentityCredentials({
                    IdentityPoolId: 'eu-north-1:98c07095-e731-4219-bebe-db4dab892ea8',
                    Logins: {
                        'cognito-idp.eu-north-1.amazonaws.com/eu-north-1_V9kLPNVXl': token
                    }
                })
            });

            // Wait for credentials to be initialized
            await new Promise((resolve, reject) => {
                AWS.config.credentials.get(err => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            const s3 = new AWS.S3();
            const currentUsername = localStorage.getItem("currentUsername");
            const today = new Date().toISOString().split('T')[0];

            // Get login times from AWS
            const loginTimesPrefix = `login-times/${today}`;
            const loginTimesResponse = await s3.listObjectsV2({
                Bucket: 'real-time-databucket',
                Prefix: loginTimesPrefix
            }).promise();

            const loginTimes = new Map();

            // Process login times
            for (const item of loginTimesResponse.Contents || []) {
                try {
                    const data = await s3.getObject({
                        Bucket: 'real-time-databucket',
                        Key: item.Key
                    }).promise();

                    const loginData = JSON.parse(data.Body.toString());
                    loginTimes.set(loginData.username, loginData.loginTime);
                } catch (error) {
                    console.error('Error processing login time:', error);
                }
            }

            // First, try to get current user's data
            try {
                const currentUserKey = `aux-realtime/${currentUsername}.json`;
                const currentUserData = await s3.getObject({
                    Bucket: 'real-time-databucket',
                    Key: currentUserKey
                }).promise();

                console.log('Current user data retrieved:', JSON.parse(currentUserData.Body.toString()));
            } catch (error) {
                console.log('No existing data for current user or error:', error);
            }

            // Get all updates
            const response = await s3.listObjectsV2({
                Bucket: 'real-time-databucket',
                Prefix: 'aux-realtime/',
                MaxKeys: 1000
            }).promise();

            console.log(`Found ${response.Contents.length} AUX updates`);

            const currentTime = Date.now();

            // Process all updates first
            const updates = await Promise.all(response.Contents.map(async (item) => {
                try {
                    const data = await s3.getObject({
                        Bucket: 'real-time-databucket',
                        Key: item.Key
                    }).promise();

                    const userState = JSON.parse(data.Body.toString());
                    const lastUpdateTime = new Date(userState.lastUpdate).getTime();
                    const timeSinceUpdate = currentTime - lastUpdateTime;

                    // Get login time from AWS, fallback to stored or current time
                    const awsLoginTime = loginTimes.get(userState.username);
                    const loginTime = userState.date === today ?
                          (awsLoginTime || userState.loginTime || new Date().toISOString()) :
                    userState.loginTime;

                    // Get export time if available
                    let exportTime = null;
                    try {
                        // First try to get from unique-ids (for new exports)
                        const uniqueIdKey = `unique-ids/${userState.username}/${today}.json`;
                        try {
                            const uniqueIdData = await s3.getObject({
                                Bucket: 'real-time-databucket',
                                Key: uniqueIdKey
                            }).promise();
                            const uniqueIdInfo = JSON.parse(uniqueIdData.Body.toString());
                            if (uniqueIdInfo.status === 'verified' || uniqueIdInfo.status === 'used') {
                                exportTime = uniqueIdInfo.verifiedAt || uniqueIdInfo.usedAt;
                            }
                        } catch (uniqueIdError) {
                            // If no unique ID data, try export-logs
                            const exportLogKey = `export-logs/${userState.username}/${today}.json`;
                            try {
                                const exportLogData = await s3.getObject({
                                    Bucket: 'real-time-databucket',
                                    Key: exportLogKey
                                }).promise();
                                const exportLogInfo = JSON.parse(exportLogData.Body.toString());
                                if (exportLogInfo.status === true) {
                                    exportTime = exportLogInfo.timestamp;
                                }
                            } catch (exportLogError) {
                                // Check in aux-data-bucket for older exports
                                const auxDataKey = `aux_data_${userState.username}_${today}`;
                                try {
                                    const response = await s3.listObjectsV2({
                                        Bucket: 'aux-data-bucket',
                                        Prefix: auxDataKey
                                    }).promise();

                                    if (response.Contents && response.Contents.length > 0) {
                                        // Get the most recent export
                                        const mostRecent = response.Contents.sort((a, b) =>
                                                                                  b.LastModified - a.LastModified
                                                                                 )[0];
                                        exportTime = mostRecent.LastModified;
                                    }
                                } catch (auxDataError) {
                                    // No export found in aux-data-bucket either
                                    console.log('No export found in any location for:', userState.username);
                                }
                            }
                        }
                    } catch (error) {
                        console.log('Error checking export status:', error);
                    }
                    return {
                        ...userState,
                        fileKey: item.Key,
                        lastModified: item.LastModified,
                        timeSinceUpdate,
                        loginTime: loginTime,
                        exportTime: exportTime,
                        status: calculateUserStatus(
                            lastUpdateTime,
                            userState.auxLabel,
                            userState.isPaused
                        )
                    };
                } catch (error) {
                    console.error(`Error processing file ${item.Key}:`, error);
                    return null;
                }
            }));

            // Filter out nulls and sort updates
            const validUpdates = updates
            .filter(update => update !== null)
            .map(update => {
                console.log('Processing update:', update);
                const status = calculateUserStatus(
                    new Date(update.lastUpdate).getTime(),
                    update.auxLabel,
                    update.isPaused
                );
                return {
                    ...update,
                    status
                };
            })
            .sort((a, b) => {
                if (a.username === currentUsername) return -1;
                if (b.username === currentUsername) return 1;
                return new Date(b.lastUpdate) - new Date(a.lastUpdate);
            });

            console.log('Processed updates:', validUpdates.length);

            // Store the latest updates for CSV download
            lastUpdates = validUpdates;

            // Update UI with the processed data
            updateDashboardUI(validUpdates);

            // Add continuous timer updates
            updateDashboardTimers();

            console.log('Dashboard update completed');

            // Broadcast update event
            const updateEvent = new CustomEvent('dashboardUpdated', {
                detail: {
                    updateCount: validUpdates.length,
                    timestamp: new Date().toISOString()
                }
            });
            window.dispatchEvent(updateEvent);

            // Start the continuous timer updates if dashboard is visible
            if (document.getElementById('aux-dashboard')) {
                if (dashboardAnimationFrame) {
                    cancelAnimationFrame(dashboardAnimationFrame);
                }
                dashboardAnimationFrame = requestAnimationFrame(updateDashboardTimers);
            }

            return validUpdates;

        } catch (error) {
            console.error('Error updating dashboard:', error);
            handleUpdateError(error);
            throw error;
        }
    }

    // Add continuous timer updates
    function updateDashboardTimers() {
        const timerCells = document.querySelectorAll('.dashboard-table td:nth-child(3)');
        timerCells.forEach(cell => {
            const row = cell.parentElement;
            const username = row.getAttribute('data-username');
            const auxState = JSON.parse(localStorage.getItem('auxState')) || {};

            if (auxState && !auxState.isPaused && auxState.username === username) {
                const startTime = auxState.startTime;
                const totalPauseDuration = auxState.totalPauseDuration || 0;
                const elapsedTime = Date.now() - startTime - totalPauseDuration;
                cell.textContent = formatTime(elapsedTime);
            }
        });

        // Continue the animation frame if the dashboard is still open
        if (document.getElementById('aux-dashboard')) {
            dashboardAnimationFrame = requestAnimationFrame(updateDashboardTimers);
        }
    }

    function handleUpdateError(error) {
        if (error.code === 'CredentialsError' ||
            error.message.includes('credentials') ||
            error.message.includes('Authentication')) {

            console.log('Credentials error, requesting re-authentication...');
            AuthService.clearAuth();
            stopDashboardUpdates();

            setTimeout(async () => {
                try {
                    const token = await AuthService.ensureAuthenticated();
                    if (token) {
                        await configureAWS(token);
                        startDashboardUpdates();
                    }
                } catch (authError) {
                    console.error('Re-authentication failed:', authError);
                    showCustomAlert('Authentication failed. Please try again.');
                }
            }, 0);
        } else {
            showCustomAlert('Error updating dashboard: ' + error.message);
        }
    }

    async function sendAuxUpdateWithRetry(maxRetries = 3, baseDelay = 1000) {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                await sendAuxUpdate();
                console.log('AUX update sent successfully on attempt', attempt + 1);
                return;
            } catch (error) {
                attempt++;
                if (attempt === maxRetries) throw error;
                const delay = baseDelay * Math.pow(2, attempt);
                console.log(`Retry attempt ${attempt} failed, waiting ${delay}ms before next attempt`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    function updateDashboardUI(updates) {
        const currentUsername = localStorage.getItem("currentUsername");
        const tbody = document.getElementById('dashboard-data');
        if (!tbody) {
            console.error('Dashboard table body not found');
            return;
        }

        // Clear existing timers
        if (window.dashboardTimers) {
            window.dashboardTimers.forEach(timer => clearInterval(timer));
        }
        window.dashboardTimers = [];

        // Clear existing content
        tbody.innerHTML = '';

        // Add pause pulse animation
        const style = document.createElement('style');
        style.textContent = `
                     @keyframes pausePulse {
                         0% { background-color: rgba(255, 165, 0, 0.05); }
                         50% { background-color: rgba(255, 165, 0, 0.1); }
                         100% { background-color: rgba(255, 165, 0, 0.05); }
                     }
                 `;
        document.head.appendChild(style);

        updates.forEach((update, index) => {
            const row = tbody.insertRow();
            const isCurrentUser = update.username === currentUsername;
            const today = new Date().toISOString().split('T')[0];

            // Add highlighting for current user
            if (isCurrentUser) {
                row.style.backgroundColor = 'rgba(108, 92, 231, 0.1)';
                row.style.borderLeft = '3px solid #6c5ce7';
                update = {
                    ...update,
                    loginTime: update.loginTime // Preserve the AWS login time
                };
            }

            // Determine status based on updated conditions
            const status = calculateUserStatus(
                new Date(update.lastUpdate).getTime(),
                update.auxLabel,
                update.isPaused
            );

            // Apply filtering
            if ((currentFilter !== 'all' && status !== currentFilter) ||
                (currentSearchTerm && !update.username.toLowerCase().includes(currentSearchTerm.toLowerCase()))) {
                row.style.display = 'none';
            }

            // Set data attributes for filtering
            row.setAttribute('data-username', update.username);
            row.setAttribute('data-status', status);

            // Username cell
            const usernameCell = row.insertCell();
            usernameCell.innerHTML = `
                         <div style="display: flex; align-items: center; gap: 10px;">
                             <img src="https://badgephotos.corp.amazon.com/?uid=${update.username}"
                                  style="width: 24px; height: 24px; border-radius: 50%;"
                                  onerror="this.style.display='none'">
                             <span>${update.username}</span>
                         </div>
                     `;

            // AUX Label cell with pause indicator
            const auxCell = row.insertCell();
            const auxLabel = determineAuxLevel(update.auxLabel);
            auxCell.textContent = auxLabel;
            if (update.isPaused) {
                const pauseIndicator = document.createElement('span');
                pauseIndicator.innerHTML = '⏸️';
                pauseIndicator.title = 'AUX Paused';
                pauseIndicator.style.opacity = '0.7';
                auxCell.appendChild(pauseIndicator);
            }

            // Time cell with pause handling
            const timeCell = row.insertCell();
            const timerId = `timer-${update.username}-${index}`;
            timeCell.id = timerId;
            updateTimerDashboard(timeCell, update);

            // Status cell with enhanced pause state
            const statusCell = row.insertCell();
            updateStatusCell(statusCell, status);
            if (update.isPaused) {
                statusCell.style.color = '#FFA500';
                statusCell.style.fontWeight = 'bold';
            }

            // Login time cell with enhanced handling
            const loginTimeCell = row.insertCell();
            const processLoginTime = async () => {
                try {
                    const today = new Date().toISOString().split('T')[0];
                    // Check if update.date matches today's date
                    const updateDate = new Date(update.date).toISOString().split('T')[0];

                    let loginTime = update.loginTime;

                    // Only process login time if the update is from today
                    if (updateDate === today) {
                        // If login time is invalid or missing, try to fetch from backend
                        if (!loginTime || loginTime === 'Invalid Date' || loginTime === 'N/A') {
                            const s3 = new AWS.S3();
                            try {
                                const response = await s3.getObject({
                                    Bucket: 'real-time-databucket',
                                    Key: `login-times/${update.username}_${today}.json`
                    }).promise();
                                const data = JSON.parse(response.Body.toString());
                                loginTime = data.loginTime;
                            } catch (error) {
                                console.log(`No stored login time found for today (${today}):`, error);
                            }
                        }

                        if (loginTime && loginTime !== 'N/A') {
                            // Handle ISO format
                            if (loginTime.includes('T')) {
                                loginTime = new Date(loginTime).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: true
                                });
                            }
                            // Handle already formatted time
                            else if (loginTime.match(/^\d{1,2}:\d{2}:\d{2}\s?(?:AM|PM)?$/i)) {
                                const [hours, minutes, seconds] = loginTime.split(':')
                                .map(num => num.replace(/[^\d]/g, ''));
                                const date = new Date();
                                date.setHours(hours, minutes, seconds);
                                loginTime = date.toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: true
                                });
                            }
                            loginTimeCell.textContent = loginTime;
                            loginTimeCell.style.color = '#4CAF50'; // Green color for valid login time
                        } else {
                            loginTimeCell.textContent = 'N/A';
                            loginTimeCell.style.color = '#FF9800'; // Orange color for N/A
                        }
                    } else {
                        // For non-today dates, display 'N/A'
                        loginTimeCell.textContent = 'N/A';
                        loginTimeCell.style.color = '#FF9800'; // Orange color for N/A
                    }

                    // Add tooltip showing the date if it's not today
                    if (updateDate !== today) {
                        loginTimeCell.title = `Data from: ${new Date(update.date).toLocaleDateString()}`;
                    }

                } catch (error) {
                    console.error('Error processing login time:', error);
                    loginTimeCell.textContent = 'N/A';
                    loginTimeCell.style.color = '#FF5722'; // Red color for error
                }
            };

            processLoginTime();

            // Add logout time with enhanced handling
            const logoutTimeCell = row.insertCell();
            const processLogoutTime = async () => {
                try {
                    let logoutTime = null;
                    const today = new Date().toISOString().split('T')[0];

                    // For current user, first check localStorage
                    if (update.username === currentUsername) {
                        logoutTime = localStorage.getItem('dailyLogoutTime');
                    }

                    // If no logout time found in localStorage or not current user, check backend
                    if (!logoutTime || logoutTime === 'Invalid Date') {
                        const s3 = new AWS.S3();
                        try {
                            const response = await s3.getObject({
                                Bucket: 'real-time-databucket',
                                Key: `logout-times/${update.username}_${today}.json`
                }).promise();
                            const data = JSON.parse(response.Body.toString());
                            logoutTime = data.logoutTime;
                        } catch (error) {
                            console.log('No stored logout time found:', error);
                        }
                    }

                    // If user is currently offline, use update.logoutTime
                    if (!logoutTime && update.logoutTime) {
                        logoutTime = update.logoutTime;
                    }

                    if (logoutTime) {
                        try {
                            // Handle ISO format
                            if (logoutTime.includes('T')) {
                                logoutTime = new Date(logoutTime).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: true
                                });
                            }
                            // Handle already formatted time
                            else if (logoutTime.match(/^\d{1,2}:\d{2}:\d{2}\s?(?:AM|PM)?$/i)) {
                                const [hours, minutes, seconds] = logoutTime.split(':')
                                .map(num => num.replace(/[^\d]/g, ''));
                                const date = new Date();
                                date.setHours(hours, minutes, seconds);
                                logoutTime = date.toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: true
                                });
                            }

                            // Check if user is offline
                            if (update.auxLabel && update.auxLabel.toLowerCase().includes('offline')) {
                                logoutTimeCell.textContent = logoutTime;
                                logoutTimeCell.style.color = '#FF5722'; // Red color for offline status
                            } else {
                                logoutTimeCell.textContent = 'Active';
                                logoutTimeCell.style.color = '#4CAF50'; // Green color for active status
                            }
                        } catch (error) {
                            console.error('Error formatting logout time:', error);
                            logoutTimeCell.textContent = 'N/A';
                        }
                    } else {
                        // If no logout time found and user is not offline, show as Active
                        if (!update.auxLabel || !update.auxLabel.toLowerCase().includes('offline')) {
                            logoutTimeCell.textContent = 'Active';
                            logoutTimeCell.style.color = '#4CAF50';
                        } else {
                            // If user is offline but no logout time found
                            logoutTimeCell.textContent = 'N/A';
                            logoutTimeCell.style.color = '#FF5722';
                        }
                    }

                    // Add tooltip with full timestamp if available
                    if (logoutTime && logoutTime !== 'Active' && logoutTime !== 'N/A') {
                        logoutTimeCell.title = `Logged out at: ${logoutTime}`;
                    }

                } catch (error) {
                    console.error('Error processing logout time:', error);
                    logoutTimeCell.textContent = 'Error';
                    logoutTimeCell.style.color = '#FF5722';
                }
            };

            processLogoutTime();

            // Export time cell
            const exportTimeCell = row.insertCell();
            if (update.exportTime) {
                const exportDate = new Date(update.exportTime);
                exportTimeCell.textContent = exportDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
                exportTimeCell.title = exportDate.toLocaleString(); // Add full date/time as tooltip
                exportTimeCell.style.color = '#4CAF50'; // Green color for exported status
            } else {
                exportTimeCell.textContent = 'Not exported';
                exportTimeCell.style.color = '#FF5722'; // Orange/red color for not exported status
            }


            // Visual indicators for paused state
            if (update.isPaused) {
                row.style.opacity = '0.85';
                row.style.backgroundColor = 'rgba(255, 165, 0, 0.05)';
                row.style.borderLeft = '3px solid #FFA500';
                row.style.animation = 'pausePulse 2s infinite';

                // Update time cell for paused state
                timeCell.style.color = '#FFA500';
                timeCell.style.fontWeight = 'bold';
                if (!timeCell.textContent.includes('(Paused)')) {
                    timeCell.innerHTML = `${timeCell.textContent} <span style="color: #FFA500;">(Paused)</span>`;
                }
            }

            // Add click handler for detailed view
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => {
                showDetailedView(update);
            });
        });

        console.log('Dashboard UI updated with', updates.length, 'entries');
        console.log('Current timers:', window.dashboardTimers.length);
    }

    function resetDailySteppingAwayTime() {
        const today = new Date().toISOString().split('T')[0];
        const lastResetDate = localStorage.getItem('lastSteppingAwayResetDate');

        if (lastResetDate !== today) {
            localStorage.setItem('totalSteppingAwayTime', '0');
            localStorage.setItem('lastSteppingAwayResetDate', today);
        }
    }

    function showDetailedView(update) {
        showCustomAlert(`
                     Username: ${update.username}
                     AUX: ${update.auxLabel}
                     Status: ${update.isPaused ? 'Paused' : 'Active'}
                     Login Time: ${new Date(update.loginTime).toLocaleString()}
                     Last Update: ${new Date(update.lastUpdate).toLocaleString()}
                     Total Pause Duration: ${formatTime(update.totalPauseDuration || 0)}
                     ${update.logoutTime ? 'Logout Time: ' + new Date(update.logoutTime).toLocaleString() : ''}
                 `);
    }

    // New helper function to determine which level to display
    function determineAuxLevel(auxLabel) {
        if (!auxLabel) return '';

        // Split the label by hyphens and trim each part
        const parts = auxLabel.split('-').map(part => part.trim());

        // If first part is "Microsite Project Work", show the complete label
        if (parts[0] === 'Microsite Project Work') {
            return auxLabel;
        }

        // For other cases, find the last non-N/A part
        for (let i = parts.length - 1; i >= 0; i--) {
            if (!parts[i].includes('N/A')) {
                return parts[i];
            }
        }

        return auxLabel; // Return original label if no valid parts found
    }


    function updateTimerDashboard(cell, update) {
        if (update.isPaused) {
            const pausedDuration = update.pauseTime - update.startTime - (update.totalPauseDuration || 0);
            cell.textContent = formatTime(pausedDuration);
        } else {
            const currentDuration = Date.now() - update.startTime - (update.totalPauseDuration || 0);
            cell.textContent = formatTime(currentDuration);
        }
    }

    // Updated status cell helper function
    function updateStatusCell(cell, status) {
        const statusColors = {
            'active': '#4CAF50',
            'away': '#FFC107',
            'paused': '#FFA500',
            'inactive': '#F44336'
        };

        const statusIcon = {
            'active': '🟢',
            'away': '🟡',
            'paused': '⏸️',
            'inactive': '🔴'
        };

        cell.innerHTML = `
                     <span class="status-indicator status-${status}"
                           style="background-color: ${statusColors[status]}">
                     </span>
                     ${status.charAt(0).toUpperCase() + status.slice(1)}
                 `;
    }

    function filterDashboard() {
        const searchInput = document.querySelector('.search-input');
        const statusFilter = document.querySelector('.status-filter');
        currentSearchTerm = searchInput.value.toLowerCase();
        currentFilter = statusFilter.value.toLowerCase();

        const rows = document.querySelectorAll('#dashboard-data tr');
        rows.forEach(row => {
            const username = row.getAttribute('data-username').toLowerCase();
            const status = row.getAttribute('data-status').toLowerCase();

            const matchesSearch = username.includes(currentSearchTerm);
            const matchesStatus = currentFilter === 'all' || status === currentFilter;

            row.style.display = matchesSearch && matchesStatus ? '' : 'none';
        });
    }


    async function retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                console.log(`Attempt ${i + 1} failed:`, error);
                lastError = error;
                if (i < maxRetries - 1) {
                    const delay = baseDelay * Math.pow(2, i);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }

    window.addEventListener('auxStateUpdate', (event) => {
        const { type, data } = event.detail;
        if (type === 'update') {
            // Update any UI elements that depend on AUX state
            const pauseButton = document.getElementById('pause-button');
            if (pauseButton) {
                pauseButton.textContent = data.isPaused ? 'Resume' : 'Pause';
                pauseButton.style.backgroundColor = data.isPaused ? '#FFA500' : '#4CAF50';
            }

            // Update timer display
            const timerElement = document.getElementById('aux-timer');
            if (timerElement) {
                timerElement.style.opacity = data.isPaused ? '0.5' : '1';
            }

            // Update status indicator if it exists
            const statusIndicator = document.querySelector('.status-indicator');
            if (statusIndicator) {
                statusIndicator.style.backgroundColor = data.isPaused ? '#FFA500' : '#4CAF50';
            }
        }
    });

    window.addEventListener('auxStateChange', (event) => {
        const data = event.detail;

        // Update pause button if exists
        const pauseButton = document.getElementById('pause-button');
        if (pauseButton) {
            pauseButton.textContent = data.isPaused ? 'Resume' : 'Pause';
            pauseButton.style.backgroundColor = data.isPaused ? '#FFA500' : '#4CAF50';
        }

        // Update status indicator if exists
        const statusIndicator = document.querySelector('.pause-status-indicator');
        if (statusIndicator) {
            statusIndicator.style.backgroundColor = data.isPaused ? '#FFA500' : '#4CAF50';
            statusIndicator.style.boxShadow = `0 0 5px ${data.isPaused ? '#FFA500' : '#4CAF50'}`;
        }

        // Update dashboard if open
        if (document.getElementById('aux-dashboard')) {
            updateDashboardData(true);
        }
    });

    window.addEventListener('online', () => {
        console.log('Connection restored, restarting dashboard updates...');
        if (document.getElementById('aux-dashboard')) {
            startDashboardUpdates();
        }
    });

    window.addEventListener('offline', () => {
        console.log('Connection lost, stopping dashboard updates...');
        stopDashboardUpdates();
        if (document.getElementById('aux-dashboard')) {
            showCustomAlert('Connection lost. Dashboard updates paused.');
        }
    });

    window.addEventListener('unhandledrejection', event => {
        console.error('Unhandled promise rejection:', event.reason);
        if (event.reason.code === 'CredentialsError') {
            handleUpdateError(event.reason);
        }
    });

    document.getElementById('dashboardButton').addEventListener('click', async () => {
        try {
            await loadCognitoSDK();
            await showDashboard();
        } catch (error) {
            console.error('Dashboard access error:', error);
            showCustomAlert('Failed to load dashboard. Please try again.');
        }
    });

    ///////////////////////////////////////
    //Flash Data Dashboard
    // Add Chart.js library
    function loadChartJS(callback) {
        const chartScript = document.createElement('script');
        chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        chartScript.onload = () => {
            console.log('Chart.js loaded successfully');
            callback();
        };
        chartScript.onerror = () => {
            console.error('Failed to load Chart.js');
            showCustomAlert('Failed to load charting library');
        };
        document.head.appendChild(chartScript);
    }

    // Helper functions for Flash Data Dashboard
    function downloadFlashReport(metrics, filters) {
        try {
            // Create CSV headers
            const headers = [
                'Category',
                'Overall Hours',
                'Conduct Hours',
                'Audit Count',
                'Site',
                'Week',
                'Year'
            ];

            // Create rows for each metric
            const rows = [];
            Object.entries(metrics).forEach(([category, data]) => {
                rows.push([
                    category.replace(/([A-Z])/g, ' $1').trim(), // Format category name
                    data.overall.toFixed(2),
                    data.conduct.toFixed(2),
                    data.audits,
                    filters.site,
                    filters.week === 'all' ? 'All Weeks' : `Week ${filters.week}`,
                    filters.year
                ]);
            });

            // Add total row
            const totals = Object.values(metrics).reduce((acc, curr) => ({
                overall: acc.overall + curr.overall,
                conduct: acc.conduct + curr.conduct,
                audits: acc.audits + curr.audits
            }), { overall: 0, conduct: 0, audits: 0 });

            rows.push([
                'TOTAL',
                totals.overall.toFixed(2),
                totals.conduct.toFixed(2),
                totals.audits,
                filters.site,
                filters.week === 'all' ? 'All Weeks' : `Week ${filters.week}`,
                filters.year
            ]);

            // Combine headers and rows
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n');

            // Create and trigger download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `flash_data_${filters.site}_${filters.year}_W${filters.week}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error downloading report:', error);
            showCustomAlert('Error downloading report');
        }
    }

    async function showFlashDataDashboard() {
        try {

            await loadAwsSdk();
            await loadCognitoSdk();


            loadChartJS(() => {

                // Create modal container
                const modal = document.createElement('div');
                modal.className = 'flash-data-modal';

                // Add styles
                const styles = document.createElement('style');
                styles.textContent = `
            .flash-data-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10002;
                backdrop-filter: blur(5px);
            }

            .dashboard-content {
                background: #1a1a1a;
                width: 90%;
                max-width: 1200px;
                height: 90vh;
                border-radius: 20px;
                padding: 25px;
                color: white;
                position: relative;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                animation: modalSlideIn 0.3s ease-out;
            }

            .dashboard-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .dashboard-title {
                font-size: 24px;
                font-weight: 600;
                color: #fff;
            }

            .dashboard-actions {
                display: flex;
                gap: 15px;
                align-items: center;
            }

            .action-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 16px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                color: white;
                background: rgba(255, 255, 255, 0.1);
                transition: all 0.3s ease;
            }

            .action-btn:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .download-btn {
                background: #4CAF50;
            }

            .download-btn:hover {
                background: #45a049;
            }

            .dashboard-filters {
                display: flex;
                gap: 15px;
                margin-bottom: 20px;
                background: rgba(255, 255, 255, 0.05);
                padding: 15px;
                border-radius: 12px;
            }

            .filter-select {
                padding: 10px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: white;
                font-size: 14px;
                min-width: 150px;
                cursor: pointer;
            }

            .filter-select:hover {
                border-color: rgba(255, 255, 255, 0.2);
            }

            .metrics-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                overflow-y: auto;
                padding: 10px;
            }

            .metric-card {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                padding: 20px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .metric-title {
                font-size: 18px;
                font-weight: 600;
                color: #fff;
                margin-bottom: 15px;
                text-transform: capitalize;
            }

            .metric-content {
                display: grid;
                gap: 12px;
            }

            .metric-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 8px;
            }

            .metric-item span {
                color: rgba(255, 255, 255, 0.7);
            }

            .metric-item strong {
                color: #4CAF50;
                font-size: 16px;
            }

            .total-metrics {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                padding: 15px;
                margin-bottom: 20px;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
            }

            .total-metric-item {
                text-align: center;
                padding: 10px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 8px;
            }

            .total-metric-label {
                color: rgba(255, 255, 255, 0.7);
                font-size: 14px;
                margin-bottom: 5px;
            }

            .total-metric-value {
                font-size: 20px;
                font-weight: 600;
                color: #4CAF50;
            }

            .charts-container {
                display: grid;
                grid-template-columns: 1fr 1fr;
                grid-template-rows: 300px 300px;
                gap: 20px;
                margin-bottom: 20px;
                padding: 20px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
            }

            .chart-wrapper {
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                padding: 15px;
                height: 300px;
            }

.charts-section {
    margin-bottom: 20px;
}

.chart-title {
    color: white;
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 10px;
    text-align: center;
}

            .close-btn {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 5px;
                opacity: 0.7;
                transition: opacity 0.3s ease;
            }

            .close-btn:hover {
                opacity: 1;
            }

            .loading {
                text-align: center;
                padding: 20px;
                color: rgba(255, 255, 255, 0.7);
            }

            @keyframes modalSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            @media (max-width: 768px) {
                .dashboard-filters {
                    flex-direction: column;
                }

                .filter-select {
                    width: 100%;
                }
            }
        `;
                document.head.appendChild(styles);

                // Create dashboard content
                modal.innerHTML = `
    <div class="dashboard-content">
        <div class="dashboard-header">
            <h2 class="dashboard-title">Flash Data Dashboard</h2>
            <div class="dashboard-actions">
                <button class="action-btn download-btn">
                    <i class="fas fa-download"></i>
                    Download Report
                </button>
                <button class="close-btn">&times;</button>
            </div>
        </div>
        <div class="dashboard-filters">
            <select id="yearFilter" class="filter-select">
                ${generateYearOptions()}
            </select>
            <select id="weekFilter" class="filter-select">
                <option value="all">All Weeks</option>
                ${Array.from({length: 52}, (_, i) =>
                             `<option value="${i+1}">Week ${i+1}</option>`
                ).join('')}
            </select>
            <select id="siteFilter" class="filter-select">
                <option value="all">All Sites</option>
                <option value="HYD">HYD</option>
                <option value="DE">DE</option>
                <option value="BCN">BCN</option>
                <option value="PEK">PEK</option>
            </select>
        </div>
        <div class="total-metrics"></div>
        <div class="charts-section">
            <div class="charts-container">
                <div class="chart-wrapper">
                    <h3 class="chart-title">Hours Distribution</h3>
                    <canvas id="hoursChart"></canvas>
                </div>
                <div class="chart-wrapper">
                    <h3 class="chart-title">Audit Distribution</h3>
                    <canvas id="auditsChart"></canvas>
                </div>
                <div class="chart-wrapper">
                    <h3 class="chart-title">Conduct Efficiency</h3>
                    <canvas id="efficiencyChart"></canvas>
                </div>
                <div class="chart-wrapper">
                    <h3 class="chart-title">Productivity Rate</h3>
                    <canvas id="trendChart"></canvas>
                </div>
            </div>
        </div>
        <div class="metrics-grid">
            <div class="loading">Loading data...</div>
        </div>
    </div>
`;

                document.body.appendChild(modal);

                // Define activity groupings
                const activityGroups = {
                    dataDive: [
                        'Data Dive',
                        'CCRI Dive',
                        'Non-DE Project',
                        'Data Analysis',
                        'VoS (Voice of Sellers)',
                        'Atlas Validation',
                        'Actionable Insights',
                        'Mapping Project',
                        'Reopen Insights',
                        'CLRO Deep Dive',
                        'NRR Deep Dive',
                        'TTR Deep Dive',
                        'Contact group validation',
                        'RCE Dive',
                        'Non RCE Dive'
                    ],
                    documentReview: [
                        'Document Review',
                        'DPM Request'
                    ],
                    testing: [
                        'UAT',
                        'Functional Testing',
                        'FUAT'
                    ],
                    smeConsultation: [
                        'Round Table',
                        'Quick Question',
                        'Side by Side'
                    ]
                };

                // Define L3 labels for Overall Hours calculation
                const overallL3Labels = [
                    'Conduct Project',
                    'Project Prep Review',
                    'Quality Review by PL',
                    'Post Project Clarity',
                    'Project Rollup',
                    'In-Project Meeting',
                    'Multi-Site Calibration',
                    'Project Rework',
                    'Personal Quality Check',
                    'Project Planning',
                    'Defect Tracker Creation',
                    'Quip Review and Update',
                    'Project Scoping',
                    'Non Conduct Project'
                ];

                // Function to update metrics
                async function updateMetrics(site, week, year) {
                    const metricsGrid = modal.querySelector('.metrics-grid');
                    const totalMetrics = modal.querySelector('.total-metrics');
                    metricsGrid.innerHTML = '<div class="loading">Loading data...</div>';
                    totalMetrics.innerHTML = '';

                    try {
                        // Initialize metrics object for all groups first
                        const metrics = {
                            dataDive: { overall: 0, conduct: 0, audits: 0 },
                            documentReview: { overall: 0, conduct: 0, audits: 0 },
                            testing: { overall: 0, conduct: 0, audits: 0 },
                            smeConsultation: { overall: 0, conduct: 0, audits: 0 }
                        };

                        // Get authentication and configure AWS
                        const token = await AuthService.ensureAuthenticated();
                        await configureAWS(token);

                        const s3 = new AWS.S3();
                        const bucketName = 'aux-data-bucket';
                        const prefixes = ['Aura_NPT_', 'aux_data_'];

                        let allData = [];

                        // Fetch and process data from S3
                        for (const prefix of prefixes) {
                            const response = await s3.listObjectsV2({
                                Bucket: bucketName,
                                Prefix: prefix
                            }).promise();

                            for (const item of response.Contents) {
                                const data = await s3.getObject({
                                    Bucket: bucketName,
                                    Key: item.Key
                                }).promise();

                                const rows = data.Body.toString('utf-8').split('\n');
                                // Skip header row
                                for (let i = 1; i < rows.length; i++) {
                                    const row = rows[i].split(',');
                                    if (row.length >= 13) {
                                        allData.push({
                                            date: new Date(row[0].trim()),
                                            weekNo: parseInt(row[1].trim()),
                                            username: row[2].trim(),
                                            auxLabel1: row[3].trim(),
                                            auxLabel2: row[4].trim(),
                                            auxLabel3: row[5].trim(),
                                            timeMinutes: parseFloat(row[6].trim()) || 0,
                                            timeHours: parseFloat(row[7].trim()) || 0,
                                            projectTitle: row[8].trim(),
                                            relatedAudits: parseInt(row[9].trim()) || 0,
                                            areYouPL: row[10].trim(),
                                            comment: row[11].trim(),
                                            site: row[12].trim()
                                        });
                                    }
                                }
                            }
                        }

                        // Filter data
                        const filteredData = allData.filter(row => {
                            const rowYear = row.date.getFullYear();
                            return (site === 'all' || row.site === site) &&
                                (week === 'all' || row.weekNo === parseInt(week)) &&
                                rowYear === parseInt(year);
                        });

                        // Process filtered data
                        filteredData.forEach(row => {
                            const auxLabel2 = row.auxLabel2;
                            const auxLabel3 = row.auxLabel3;
                            const timeHours = parseFloat(row.timeHours) || 0;
                            const audits = parseInt(row.relatedAudits) || 0;

                            // Check each activity group
                            if (activityGroups.dataDive.includes(auxLabel2)) {
                                if (overallL3Labels.includes(auxLabel3)) {
                                    metrics.dataDive.overall += timeHours;
                                }
                                if (auxLabel3 === 'Conduct Project') {
                                    metrics.dataDive.conduct += timeHours;
                                    metrics.dataDive.audits += audits;
                                }
                            }
                            else if (activityGroups.documentReview.includes(auxLabel2)) {
                                if (overallL3Labels.includes(auxLabel3)) {
                                    metrics.documentReview.overall += timeHours;
                                }
                                if (auxLabel3 === 'Conduct Project') {
                                    metrics.documentReview.conduct += timeHours;
                                    metrics.documentReview.audits += audits;
                                }
                            }
                            else if (activityGroups.testing.includes(auxLabel2)) {
                                if (overallL3Labels.includes(auxLabel3)) {
                                    metrics.testing.overall += timeHours;
                                }
                                if (auxLabel3 === 'Conduct Project') {
                                    metrics.testing.conduct += timeHours;
                                    metrics.testing.audits += audits;
                                }
                            }
                            else if (activityGroups.smeConsultation.includes(auxLabel2)) {
                                if (overallL3Labels.includes(auxLabel3)) {
                                    metrics.smeConsultation.overall += timeHours;
                                }
                                if (auxLabel3 === 'Conduct Project') {
                                    metrics.smeConsultation.conduct += timeHours;
                                    metrics.smeConsultation.audits += audits;
                                }
                            }
                        });

                        // Round all metric values
                        Object.keys(metrics).forEach(group => {
                            metrics[group].overall = Math.round(metrics[group].overall * 100) / 100;
                            metrics[group].conduct = Math.round(metrics[group].conduct * 100) / 100;
                        });

                        // Calculate totals
                        const totals = {
                            overall: 0,
                            conduct: 0,
                            audits: 0
                        };

                        Object.values(metrics).forEach(metric => {
                            totals.overall += metric.overall;
                            totals.conduct += metric.conduct;
                            totals.audits += metric.audits;
                        });

                        // Round total values
                        totals.overall = Math.round(totals.overall * 100) / 100;
                        totals.conduct = Math.round(totals.conduct * 100) / 100;

                        // Update total metrics display
                        totalMetrics.innerHTML = `
                        <div class="total-metric-item">
                            <div class="total-metric-label">Total Overall Hours</div>
                            <div class="total-metric-value">${totals.overall.toFixed(2)}</div>
                        </div>
                        <div class="total-metric-item">
                            <div class="total-metric-label">Total Conduct Hours</div>
                            <div class="total-metric-value">${totals.conduct.toFixed(2)}</div>
                        </div>
                        <div class="total-metric-item">
                            <div class="total-metric-label">Total Audits</div>
                            <div class="total-metric-value">${totals.audits}</div>
                        </div>
                    `;

                        // Update metrics display
                        metricsGrid.innerHTML = Object.entries(metrics)
                            .map(([group, data]) => `
                            <div class="metric-card">
                                <div class="metric-title">${group.replace(/([A-Z])/g, ' $1').trim()}</div>
                                <div class="metric-content">
                                    <div class="metric-item">
                                        <span>Overall Hours:</span>
                                        <strong>${data.overall.toFixed(2)}</strong>
                                    </div>
                                    <div class="metric-item">
                                        <span>Conduct Hours:</span>
                                        <strong>${data.conduct.toFixed(2)}</strong>
                                    </div>
                                    <div class="metric-item">
                                        <span>Audit Count:</span>
                                        <strong>${data.audits}</strong>
                                    </div>
                                </div>
                            </div>
                        `).join('');

                        // Store current metrics for download
                        createCharts(metrics);
                        metricsGrid.dataset.currentMetrics = JSON.stringify(metrics);

                    } catch (error) {
                        console.error('Error updating metrics:', error);
                        metricsGrid.innerHTML = '<div class="loading">Error loading data</div>';
                    }
                }

                // Add event listeners
                modal.querySelector('.close-btn').addEventListener('click', () => {
                    modal.remove();
                    styles.remove();
                });

                modal.querySelector('.download-btn').addEventListener('click', () => {
                    const metrics = JSON.parse(modal.querySelector('.metrics-grid').dataset.currentMetrics || '{}');
                    const filters = {
                        site: modal.querySelector('#siteFilter').value,
                        week: modal.querySelector('#weekFilter').value,
                        year: modal.querySelector('#yearFilter').value
                    };
                    downloadFlashReport(metrics, filters);
                });

                modal.querySelector('#yearFilter').addEventListener('change', (e) => {
                    updateMetrics(
                        modal.querySelector('#siteFilter').value,
                        modal.querySelector('#weekFilter').value,
                        e.target.value
                    );
                });

                modal.querySelector('#weekFilter').addEventListener('change', (e) => {
                    updateMetrics(
                        modal.querySelector('#siteFilter').value,
                        e.target.value,
                        modal.querySelector('#yearFilter').value
                    );
                });

                modal.querySelector('#siteFilter').addEventListener('change', (e) => {
                    updateMetrics(
                        e.target.value,
                        modal.querySelector('#weekFilter').value,
                        modal.querySelector('#yearFilter').value
                    );
                });

                // Initial load with current year
                const currentYear = new Date().getFullYear();
                updateMetrics('all', 'all', currentYear);
            });
        } catch (error) {
            console.error('Error showing Flash Data dashboard:', error);
            showCustomAlert('Error loading Flash Data dashboard');
        }
    }

    function createCharts(metrics) {
        // Destroy all existing charts first
        // Get all chart instances and destroy them
        Chart.helpers.each(Chart.instances, (instance) => {
            instance.destroy();
        });
        ['hoursChart', 'auditsChart', 'efficiencyChart', 'trendChart'].forEach(chartId => {
            const existingChart = Chart.getChart(chartId);
            if (existingChart) {
                existingChart.destroy();
            }
        });
        // Destroy existing charts if they exist
        const existingCharts = Chart.getChart("hoursChart");
        if (existingCharts) existingCharts.destroy();
        const existingAuditCharts = Chart.getChart("auditsChart");
        if (existingAuditCharts) existingAuditCharts.destroy();

        // Prepare data
        const labels = Object.keys(metrics).map(key => key.replace(/([A-Z])/g, ' $1').trim());
        const overallHours = Object.values(metrics).map(m => m.overall);
        const conductHours = Object.values(metrics).map(m => m.conduct);
        const audits = Object.values(metrics).map(m => m.audits);

        // Hours Chart
        const hoursCtx = document.getElementById('hoursChart').getContext('2d');
        new Chart(hoursCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Overall Hours',
                        data: overallHours,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Conduct Hours',
                        data: conductHours,
                        backgroundColor: 'rgba(75, 192, 192, 0.5)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                }
            }
        });

        // Audits Chart
        const auditsCtx = document.getElementById('auditsChart').getContext('2d');
        new Chart(auditsCtx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: audits,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.5)',
                        'rgba(54, 162, 235, 0.5)',
                        'rgba(255, 206, 86, 0.5)',
                        'rgba(75, 192, 192, 0.5)'
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                }
            }
        });
        // Efficiency Chart (Conduct Hours / Overall Hours ratio)
        const efficiencyCtx = document.getElementById('efficiencyChart').getContext('2d');
        const efficiencyData = Object.entries(metrics).map(([group, data]) => ({
            group: group.replace(/([A-Z])/g, ' $1').trim(),
            efficiency: data.overall > 0 ? (data.conduct / data.overall * 100).toFixed(2) : 0
        }));

        new Chart(efficiencyCtx, {
            type: 'radar',
            data: {
                labels: efficiencyData.map(d => d.group),
                datasets: [{
                    label: 'Conduct Efficiency %',
                    data: efficiencyData.map(d => d.efficiency),
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(153, 102, 255, 1)',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        pointLabels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Conduct Efficiency by Activity Type',
                        color: 'rgba(255, 255, 255, 0.9)'
                    }
                }
            }
        });

        // Productivity Trend Chart (Audits per Conduct Hour)
        const trendCtx = document.getElementById('trendChart').getContext('2d');
        const productivityData = Object.entries(metrics).map(([group, data]) => ({
            group: group.replace(/([A-Z])/g, ' $1').trim(),
            productivity: data.conduct > 0 ? (data.audits / data.conduct).toFixed(2) : 0
        }));

        new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: productivityData.map(d => d.group),
                datasets: [{
                    label: 'Audits per Conduct Hour',
                    data: productivityData.map(d => d.productivity),
                    borderColor: 'rgba(255, 159, 64, 1)',
                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: 'rgba(255, 159, 64, 1)',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Productivity Rate by Activity Type',
                        color: 'rgba(255, 255, 255, 0.9)'
                    }
                }
            }
        });
    }

    // Add click handler to Flash data button
    document.getElementById('flashDataButton').addEventListener('click', async () => {
        const username = localStorage.getItem("currentUsername");
        console.log('Current username:', username);

        try {
            const script = document.createElement('script');
            script.src = 'https://mofi-l.github.io/aux-auth-config/auth-config.js';

            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });

            const isAuthorized = window.AUTH_CONFIG.authorizedUsers.includes(username);
            console.log('Authorization result:', isAuthorized);

            document.head.removeChild(script);
            delete window.AUTH_CONFIG;

            if (!isAuthorized) {
                showCustomAlert("You don't have permission to access the Flash Data Dashboard");
                return;
            }

            showFlashDataDashboard();

        } catch (error) {
            console.error('Error checking authorization:', error);
            showCustomAlert('Failed to verify access permissions: ' + error.message);
        }
    });
    ///////////////////////////////////////////
    //Timer Functions//
    function cleanupTimer() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function formatLocalTime(timeString) {
        if (!timeString) return 'N/A';

        try {
            // Handle ISO string format
            if (timeString.includes('T')) {
                return new Date(timeString).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
            }

            // Handle HH:MM:SS format
            if (timeString.includes(':')) {
                const [hours, minutes, seconds] = timeString.split(':');
                const date = new Date();
                date.setHours(hours, minutes, seconds);
                return date.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
            }

            return 'N/A';
        } catch (error) {
            console.error('Error formatting time:', error);
            return 'N/A';
        }
    }

    function parseTime(timeString) {
        if (typeof timeString === 'number') {
            return timeString;
        }

        if (typeof timeString === 'string') {
            timeString = timeString.replace(/\s*(AM|PM)/i, '').trim();

            if (timeString.includes(':')) {
                const [hours, minutes, seconds] = timeString.split(':').map(Number);
                return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
            }
        }

        return parseInt(timeString, 10);
    }

    function formatTime(ms) {
        // If input is a string in HH:MM:SS format, convert to milliseconds
        if (typeof ms === 'string' && ms.includes(':')) {
            const [hours, minutes, seconds] = ms.split(':').map(Number);
            ms = ((hours * 3600 + minutes * 60 + seconds) * 1000);
        }

        // Ensure ms is a number
        ms = Number(ms);

        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }


    function getLocalTimeString(date) {
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function convertToUTC(timeString) {
        const date = new Date();
        const [hours, minutes, seconds] = timeString.split(':').map(Number);
        date.setHours(hours, minutes, seconds);
        return date.toUTCString();
    }

    function calculateTimeSpent(startTime) {
        const endTime = new Date();
        return endTime - new Date(startTime);
    }

    function displayTimer() {
        let timerElement = document.getElementById('aux-timer');
        if (!timerElement) {
            const widget = document.getElementById('aux-widget');
            if (widget) {
                timerElement = document.createElement('div');
                timerElement.id = 'aux-timer';
                timerElement.style.padding = '10px';
                timerElement.style.marginTop = '10px';
                timerElement.style.background = '#f0f0f0';
                timerElement.style.borderRadius = '5px';
                widget.appendChild(timerElement);
            }
        }
        return timerElement;
    }

    function updateTimer(startTime, auxLabel, timerElement) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }

        const currentElapsedTime = new Date().getTime() - startTime;
        const cleanedAuxLabel = auxLabel.replace(/\s*-\s*N\/A\s*/g, '').trim();
        const auxParts = cleanedAuxLabel.split(' - ').filter(part => part.trim() !== '');
        let displayedAuxLabel = '';

        if (auxParts.length === 1) {
            displayedAuxLabel = auxParts[0];
        } else if (auxParts.length === 2) {
            displayedAuxLabel = auxParts[1];
        } else if (auxParts.length === 3) {
            displayedAuxLabel = auxParts[2];
        } else {
            displayedAuxLabel = 'No AUX available';
        }

        timerElement.textContent = `${displayedAuxLabel} : ${formatTime(currentElapsedTime)}`;
        timerElement.title = `Current AUX: ${cleanedAuxLabel}`;

        animationFrameId = requestAnimationFrame(() => updateTimer(startTime, auxLabel, timerElement));
    }

    function startAUXTimer(auxLabel, elapsedTime = 0) {
        cleanupTimer();

        const auxState = JSON.parse(localStorage.getItem('auxState'));
        if (auxState && auxState.auxLabel === auxLabel) {
            updateTimerDisplay(auxLabel, calculateTimeSpent(auxState.startTime));
            return;
        }

        stopAUXTimer();

        const startTime = new Date().getTime() - elapsedTime;
        localStorage.setItem('auxState', JSON.stringify({
            auxLabel,
            startTime,
            timestamp: Date.now()
        }));

        const timerElement = displayTimer();
        requestAnimationFrame(() => updateTimer(startTime, auxLabel, timerElement));

        localStorage.setItem('auxChange', JSON.stringify({
            action: 'startTimer',
            auxLabel,
            timestamp: Date.now()
        }));

        saveAUXData({
            auxLabel,
            timeSpent: 0,
            date: formatDate(new Date()),
            username: displayUsername(),
            projectTitle: '',
            areYouPL: '',
            comment: ''
        });
        localStorage.setItem('auxStartTime', startTime);
    }

    function stopAUXTimer() {
        cleanupTimer();
        if (timerUpdateDebounce) {
            clearTimeout(timerUpdateDebounce);
        }

        const auxState = JSON.parse(localStorage.getItem('auxState'));
        if (auxState) {
            const { auxLabel, startTime } = auxState;
            const endTime = new Date();
            const timeSpent = endTime - new Date(startTime);
            saveAUXData({
                date: formatDate(endTime),
                username: displayUsername(),
                auxLabel,
                timeSpent
            });
            localStorage.removeItem('auxState');
            localStorage.setItem('auxChange', JSON.stringify({
                action: 'stopTimer',
                timestamp: Date.now()
            }));
        }
    }

    function isAfter12PM() {
        const now = new Date();
        return now.getHours() >= 12;
    }

    function checkLoginStatus() {
        const username = displayUsername();
        if (username) {
            localStorage.setItem('userLoggedIn', true);
            console.log('User logged in:', username);

            const now = new Date();
            if (now.getHours() < 12) {
                localStorage.setItem('loggedBefore12', true);
            }

            localStorage.removeItem('timerStatus');
        }
    }

    function calculateElapsedTimeFrom12PM() {
        const now = new Date();
        const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
        const elapsedTime = now - noon;

        if (elapsedTime < 0) {
            return 0;
        }

        return elapsedTime;
    }

    function restoreTimer() {
        const auxState = JSON.parse(localStorage.getItem('auxState'));
        const manualAUXChange = localStorage.getItem('manualAUXChange');

        if (auxState && auxState.startTime) {
            const startTime = auxState.startTime;
            let auxLabel = auxState.auxLabel;

            auxLabel = auxLabel.replace(/\s*-\s*N\/A\s*/g, '').trim();

            const auxParts = auxLabel.split(' - ').filter(part => part.trim() !== '');

            let displayedAuxLabel = '';

            if (auxParts.length === 1) {
                displayedAuxLabel = auxParts[0];
            } else if (auxParts.length === 2) {
                displayedAuxLabel = auxParts[1];
            } else if (auxParts.length === 3) {
                displayedAuxLabel = auxParts[2];
            } else {
                displayedAuxLabel = 'No AUX available';
            }

            updateAuxSelection();

            const timerElement = displayTimer();
            const timerId = setInterval(() => {
                const elapsedTime = calculateTimeSpent(startTime);
                timerElement.textContent = `${displayedAuxLabel} : ${formatTime(elapsedTime)}`;
                timerElement.title = `Current AUX: ${auxLabel}`;
                timerElement.style.color = 'black';
            }, 1000);

            localStorage.setItem('auxTimerId', timerId.toString());
        }
    }

    function updateAuxSelection(auxLabel) {
        if (!auxLabel) return;

        const parts = auxLabel.split(' - ');
        const l1Value = parts[0];
        const l2Value = parts[1] !== 'N/A' ? parts[1] : '';
        const l3Value = parts[2] !== 'N/A' ? parts[2] : '';

        const auxL1 = document.getElementById('aux-l1');
        const auxL2Container = document.getElementById('aux-l2-container');
        const auxL3Container = document.getElementById('aux-l3-container');
        if (auxL1 && l1Value) {
            auxL1.value = Object.keys(l1Names).find(key => l1Names[key] === l1Value);
            auxL1.dispatchEvent(new Event('change'));
        }

        setTimeout(() => {
            const auxL2 = document.getElementById('aux-l2');
            if (auxL2 && l2Value) {
                auxL2.value = l2Value;
                auxL2.dispatchEvent(new Event('change'));
            }

            setTimeout(() => {
                const auxL3 = document.getElementById('aux-l3');
                if (auxL3 && l3Value) {
                    auxL3.value = l3Value;
                    auxL3.dispatchEvent(new Event('change'));
                }
            }, 100);
        }, 100);
    }

    function updateTimerDisplay(auxLabel, elapsedTime) {
        const timerElement = displayTimer();

        if (timerElement) {
            const cleanedAuxLabel = auxLabel.replace(/\s*-\s*N\/A\s*/g, '').trim();
            const auxParts = cleanedAuxLabel.split(' - ').filter(part => part.trim() !== '');

            let displayedAuxLabel = '';

            if (auxParts.length === 1) {
                displayedAuxLabel = auxParts[0];
            } else if (auxParts.length === 2) {
                displayedAuxLabel = auxParts[1];
            } else if (auxParts.length === 3) {
                displayedAuxLabel = auxParts[2];
            } else {
                displayedAuxLabel = 'No AUX available';
            }
            timerElement.textContent = `${displayedAuxLabel} : ${formatTime(elapsedTime)}`;
            timerElement.title = `Current AUX: ${cleanedAuxLabel || 'No AUX available'}`;
        } else {
            console.error('Timer element not found.');
        }
    }

    // Storage event listener with debounce
    window.addEventListener('storage', function(event) {
        if (event.key === 'auxState') {
            const auxState = JSON.parse(event.newValue);
            if (auxState) {
                cleanupTimer();
                const startTime = auxState.startTime;
                const elapsedTime = calculateTimeSpent(auxState.startTime);
                const auxLabel = auxState.auxLabel;
                const timerElement = displayTimer();

                updateAuxSelection(auxLabel);
                updateTimerDisplay(auxLabel, elapsedTime);

                requestAnimationFrame(() => updateTimer(startTime, auxLabel, timerElement));
            }
        } else if (event.key === 'auxChange') {
            const data = JSON.parse(event.newValue);
            if (data && data.action === 'startTimer') {
                const auxState = JSON.parse(localStorage.getItem('auxState'));
                if (auxState && auxState.timestamp === data.timestamp) {
                    updateAuxSelection(data.auxLabel);
                }
            } else if (data && data.action === 'stopTimer') {
                cleanupTimer();
                updateTimerDisplay('', 0);
            }
        }
    });

    // Cleanup on page unload
    window.addEventListener('unload', () => {
        cleanupTimer();
        if (timerUpdateDebounce) {
            clearTimeout(timerUpdateDebounce);
        }
    });

    const debouncedSendUpdate = debounce(sendAuxUpdate, 1000);

    // Debounce function for search inputs
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    //Function to ensure proper cleanup when switching AUX states
    async function handleAuxStateChange(newAuxLabel) {
        cleanupTimer();
        startAUXTimer(newAuxLabel);

        // Store logout time if going offline
        if (newAuxLabel.toLowerCase().includes('offline')) {
            await setLogoutTime(newAuxLabel);
        }

        const currentState = JSON.parse(localStorage.getItem('auxState')) || {};
        const now = new Date().getTime();

        // If previous state was "Stepping Away", calculate and accumulate time
        if (currentState.auxLabel && currentState.auxLabel.includes('Stepping Away')) {
            const steppingAwayDuration = now - currentState.startTime;
            const totalSteppingAwayTime = parseInt(localStorage.getItem('totalSteppingAwayTime') || '0');
            localStorage.setItem('totalSteppingAwayTime', totalSteppingAwayTime + steppingAwayDuration);
        }

        // Update current state
        const newState = {
            auxLabel: newAuxLabel,
            startTime: now,
            isPaused: false,
            lastUpdate: now
        };

        localStorage.setItem('auxState', JSON.stringify(newState));

        try {
            await debouncedSendUpdate();
        } catch (error) {
            console.error('Failed to send AUX update:', error);
        }
    }

    checkForUpdates();
    setInitialLoginTime();
    resetDailySteppingAwayTime();
    injectAuthStyles();
    addFileInput();
    restoreTimer();
    checkLoginStatus();
    ///////////////////////////////////////////////////////////////
    //DOM content loaded
    document.addEventListener('DOMContentLoaded', () => {
        checkForUpdates();
        resetDailySteppingAwayTime();
        setInitialLoginTime();
        injectAuthStyles();
        cleanupTimer();
        restoreTimer();
        addFileInput();
        checkLoginStatus();

        const auxState = JSON.parse(localStorage.getItem('auxState'));
        if (auxState && auxState.auxLabel) {
            updateAuxSelection(auxState.auxLabel);
        }
    });

    document.addEventListener('change', function(event) {
        const auxLabel = event.target.value;
        if (event.target && event.target.id === 'aux-label') {
            if (auxLabel) {
                startAUXTimer(auxLabel);
            } else {
                stopAUXTimer();
            }
        }
    });

    // Add version checking function
    async function checkForUpdates() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/Mofi-l/aura-tool/main/aura.meta.js');
            const metaContent = await response.text();

            const versionMatch = metaContent.match(/@version\s+(\d+\.\d+)/);
            if (versionMatch) {
                const latestVersion = versionMatch[1];
                const currentVersion = "3.02"; // Hardcode current version here

                if (parseFloat(latestVersion) > parseFloat(currentVersion)) {
                    showCustomConfirm('A new version is available. Would you like to update now?', (confirmed) => {
                        if (confirmed) {
                            window.location.href = 'https://raw.githubusercontent.com/Mofi-l/aura-tool/main/aura.user.js';
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
        }
    }

    //Quotes and Version
    const versionText = document.createElement('div');
    versionText.id = 'version-text';
    versionText.style.position = 'absolute';
    versionText.style.bottom = '10px';
    versionText.style.right = '10px';
    versionText.style.color = 'white';
    versionText.style.cursor = 'pointer';
    versionText.style.fontSize = '12px';
    versionText.innerText = `${currentVersion}`;

    const widget = document.getElementById('aux-widget');
    widget.appendChild(versionText);

    const gistURL = "https://gist.githubusercontent.com/Mofi-l/878a781fdb73476ad6751c81834badb9/raw/bcdf6e2dbe6375e0ee2b30014d9c9d99b9aeea00/quotes.json";

    versionText.addEventListener('mouseenter', () => {
        fetch(gistURL)
            .then(response => response.json())
            .then(data => {
            const randomQuote = data[Math.floor(Math.random() * data.length)];
            versionText.setAttribute('title', randomQuote);
        })
            .catch(err => {
            console.error('Failed to fetch quotes:', err);
            versionText.setAttribute('title', 'Error fetching quote.');
        });
    });
})();