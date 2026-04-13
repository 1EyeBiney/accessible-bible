// ui.js - Shared User Interface & Accessibility Helpers

export const announcer = document.getElementById('aria-announcer');

export function speak(message) {
    announcer.textContent = '';
    setTimeout(() => {
        announcer.textContent = message;
    }, 50); 
}