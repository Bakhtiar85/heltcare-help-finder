// src/config.ts  (selectors unchanged; keeping here for clarity)
export const BASE_URL = 'https://www.healthcare.gov/find-local-help/';

// where JSON saves go (MM-DD-YY-ZIP-PAGE.json)
export const OUTPUT_DIR = './output/json';

// edit this when you want a different ZIP
export const POSTAL_CODE = '32073';

export const SELECTORS = {
  // input
  postalInput: 'input[name="flh-location-search"]',

  // autocomplete menu & options (covers observed markup)
  menuContainer: '.ds-c-autocomplete__menu-container',
  autocompleteOptions:
    '.ds-c-autocomplete__menu-container[role="option"], .ds-c-autocomplete[role="listbox"][role="option"], .ds-c-autocomplete__menu[role="option"], .ds-c-autocomplete[role="listbox"] li, .ds-c-autocomplete__menu li',

  // buttons
  searchButton: 'form button.ds-c-button.ds-c-button--solid',
  // UPDATED: treat aria-disabled as disabled too
  searchButtonEnabled:
    'form button.ds-c-button.ds-c-button--solid:not([disabled]):not([aria-disabled="true"])',
  searchButtonsAll: 'form button', // to find the one with text "Search"

  // results UI
  resultsContainer: '#filter-results-container', // appears on results pages
  agentTab: 'a#agent__tab[href="#agent"]',

  // list + pagination
  agentListOl: '#filter-results-container > div:nth-child(3) > div:nth-child(2) > div > div > div.ds-l-row > div > ol',
  agentListItems: '#filter-results-container > div:nth-child(3) > div:nth-child(2) > div > div > div.ds-l-row > div > ol li',
  nextPage:
    'a[aria-label*="Next page"]:not([aria-disabled="true"]), button[aria-label*="Next page"]:not([aria-disabled="true"])'
} as const;
