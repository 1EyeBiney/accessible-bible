export const DB_NAME = "BibleStudyDB";
export const DB_VERSION = 6;
export const TEXT_STORE = "bibleText";
export const NOTES_STORE = "userNotes";
export const BOOKMARKS_STORE = "userBookmarks";
export const COMMENTARY_STORE = "expertCommentary";

export const helpMenuData = [
    "Help Menu: Use up and down arrows to navigate, Escape to close.",
    "Basic Navigation: Left and Right arrows move between verses.",
    "Basic Navigation: Page Up and Page Down move between chapters.",
    "Basic Navigation: Shift plus Page Up or Page Down moves between books.",
    "Vertical Actions: Up arrow reads the note for the current verse.",
    "Vertical Actions: Down arrow opens the Verse Menu to edit, delete, or copy.",
    "Search: Press B for Book search, F for Word search, C for Chapter jump, and V for Verse jump.",
    "Search: Use left and right brackets to cycle through word search results.",
    "Relational Links: Press R to anchor a verse. Press Alt plus L to drop a link to it.",
    "Relational Links: Press Alt plus J to jump to links in your current note. Press Backspace to return.",
    "Audio: Press N to skip ambient tracks. Press Shift plus V to cycle volume.",
    "Audio Codex: Press H to open the tutorial player. Use Space, arrows, and Escape inside the overlay.",
    "Utilities: Press Tab for current location. Press S for chapter stats. Press F12 for Keyboard Explorer."
];

export const AUDIO_GAIN_BOOST = 1.45;
export const THEMES = ['default', 'midnight', 'amber', 'macular', 'cyan'];

export const tutorialChapters = [
    { file: '00_tutorial_and_help.mp3', title: 'Chapter 0: Tutorial Controls' },
    { file: '01_navigation.mp3', title: 'Chapter 1: Basic Navigation' },
    { file: '02_targeted_movement.mp3', title: 'Chapter 2: Targeted Movement' },
    { file: '03_search_and_status.mp3', title: 'Chapter 3: Search and Status' },
    { file: '04_notes.mp3', title: 'Chapter 4: Notes' },
    { file: '05_relational_linking.mp3', title: 'Chapter 5: Relational Linking' },
    { file: '06_commentary_and_options.mp3', title: 'Chapter 6: Commentary and Options' },
    { file: '07_audio_and_visuals.mp3', title: 'Chapter 7: Audio and Visuals' }
];

export const hymnList = [
    'a_mighty_fortress_is_our_god1.mp3', 'a_mighty_fortress_is_our_god2.mp3',
    'amazing_grace1.mp3', 'amazing_grace2.mp3', 'amazing_grace3.mp3', 'amazing_grace4.mp3',
    'blessed_assurance1.mp3', 'blessed_assurance2.mp3',
    'come_thou_fount_of_many_blessings1.mp3', 'come_thou_fount_of_many_blessings2.mp3', 'come_thou_fount_of_many_blessings3.mp3', 'come_thou_fount_of_many_blessings4.mp3',
    'crown_him_with_many_crowns1.mp3', 'crown_him_with_many_crowns2.mp3',
    'great_is_thy_faithfulness1.mp3', 'great_is_thy_faithfulness2.mp3',
    'holy_holy_holy1.mp3', 'holy_holy_holy2.mp3',
    'how_great_thou_art1.mp3', 'how_great_thou_art2.mp3',
    'it_is_well_with_my_soul1.mp3', 'it_is_well_with_my_soul2.mp3',
    'rock_of_ages1.mp3', 'rock_of_ages2.mp3',
    'what_a_friend_we_have_in_jesus1.mp3', 'what_a_friend_we_have_in_jesus2.mp3'
];

export const volumeStages = [0.0, 0.05, 0.1, 0.2, 0.3, 0.4];