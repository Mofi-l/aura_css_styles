// widgetStyles.js
export function injectWidgetStyles() {
const styles = `
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

const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

}