
        document.addEventListener('DOMContentLoaded', () => {
            const listHeadingInput = document.getElementById('list-heading');
            const personNameInput = document.getElementById('person-name');
            const reasonInput = document.getElementById('reason');
            const startBtn = document.getElementById('start-btn');
            const statusText = document.getElementById('status');
            const dataTableBody = document.getElementById('data-table-body');
            const saveListBtn = document.getElementById('save-list-btn');
            const clearListBtn = document.getElementById('clear-list-btn');
            const viewListsBtn = document.getElementById('view-lists-btn');
            const viewListsModal = document.getElementById('view-lists-modal');
            const closeViewModalBtn = document.getElementById('close-view-modal');
            const savedListsContainer = document.getElementById('saved-lists-container');

            let recognition = null;
            let currentList = [];
            let itemCounter = 0;
            const DB_NAME = 'VoiceToTableDB';
            const DB_VERSION = 1;
            const LIST_STORE_NAME = 'purchaseLists';
            let db;

            // Custom modal for alerts and confirmations
            function showModal(message, confirmText = 'OK', cancelText = 'Cancel') {
                return new Promise((resolve) => {
                    const modal = document.getElementById('modal');
                    const modalMessage = document.getElementById('modal-message');
                    const modalConfirm = document.getElementById('modal-confirm');
                    const modalCancel = document.getElementById('modal-cancel');

                    modalMessage.textContent = message;
                    modalConfirm.textContent = confirmText;
                    modalCancel.textContent = cancelText;
                    modal.classList.remove('hidden');

                    const handleConfirm = () => {
                        modal.classList.add('hidden');
                        resolve(true);
                        modalConfirm.removeEventListener('click', handleConfirm);
                        modalCancel.removeEventListener('click', handleCancel);
                    };

                    const handleCancel = () => {
                        modal.classList.add('hidden');
                        resolve(false);
                        modalConfirm.removeEventListener('click', handleConfirm);
                        modalCancel.removeEventListener('click', handleCancel);
                    };

                    modalConfirm.addEventListener('click', handleConfirm);
                    modalCancel.addEventListener('click', handleCancel);
                });
            }

            // Function to initialize IndexedDB
            function initDb() {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open(DB_NAME, DB_VERSION);

                    request.onupgradeneeded = (event) => {
                        db = event.target.result;
                        // Create an object store for our lists. We will store each full list as one object.
                        db.createObjectStore(LIST_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    };

                    request.onsuccess = (event) => {
                        db = event.target.result;
                        console.log('IndexedDB initialized successfully.');
                        resolve(db);
                    };

                    request.onerror = (event) => {
                        console.error('Error opening IndexedDB:', event.target.errorCode);
                        reject(event.target.error);
                    };
                });
            }

            // Function to start speech recognition
            function startSpeechRecognition() {
                // Check if the browser supports the SpeechRecognition API
                if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                    showModal('Your browser does not support the Web Speech API. Please use Chrome or Edge.');
                    return;
                }
                
                // Use the vendor-prefixed version for broader compatibility
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                recognition = new SpeechRecognition();
                recognition.continuous = false; // Set to true if you want it to continue listening
                recognition.interimResults = false;
                recognition.lang = 'ta-IN'; // Retaining Tamil language support

                // Event handler when recognition starts
                recognition.onstart = () => {
                    statusText.textContent = 'Listening...';
                    startBtn.classList.add('recording');
                };

                // Event handler for each result
                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    statusText.textContent = `Heard: "${transcript}"`;
                    parseAndAddItem(transcript);
                };

                // Event handler for when recognition ends (either manually or by itself)
                recognition.onend = () => {
                    statusText.textContent = 'Click to start listening';
                    startBtn.classList.remove('recording');
                };

                // Event handler for errors
                recognition.onerror = (event) => {
                    startBtn.classList.remove('recording');
                    let errorMessage = 'An error occurred. Please try again.';
                    
                    switch (event.error) {
                        case 'not-allowed':
                            errorMessage = 'Microphone access was denied. Please allow microphone access in your browser settings.';
                            break;
                        case 'no-speech':
                            errorMessage = 'No speech was detected. Please try again.';
                            break;
                        case 'aborted':
                            errorMessage = 'Speech recognition was aborted.';
                            break;
                        case 'network':
                            errorMessage = 'A network error occurred. Please check your internet connection.';
                            break;
                        case 'audio-capture':
                            errorMessage = 'Audio capture failed. Please check your microphone.';
                            break;
                        case 'bad-grammar':
                            errorMessage = 'The speech recognition engine had a problem with the grammar.';
                            break;
                        case 'language-not-supported':
                            errorMessage = 'The specified language is not supported.';
                            break;
                        case 'service-not-allowed':
                            errorMessage = 'The recognition service is not allowed.';
                            break;
                        case 'service-down':
                            errorMessage = 'The recognition service is not available.';
                            break;
                        default:
                            break;
                    }
                    
                    statusText.textContent = `Error: ${errorMessage}`;
                    showModal(errorMessage);
                };

                recognition.start();
            }

            // Function to parse the spoken text and add one or more items
            function parseAndAddItem(text) {
                // Split spoken input by comma to support multiple items
                const parts = text.split(/[,，]/).map(p => p.trim()).filter(p => p.length > 0);

                parts.forEach(part => {
                    // Mapping for Tamil number words to digits
                    const tamilNumbers = {
                        'ஒன்று': '1', 'ஒரு': '1', 'இரண்டு': '2', 'மூன்று': '3', 'நான்கு': '4', 'ஐந்து': '5',
                        'ஆறு': '6', 'ஏழு': '7', 'எட்டு': '8', 'ஒன்பது': '9', 'பத்து': '10',
                        'பதினொன்று': '11', 'பன்னிரண்டு': '12', 'நூறு': '100', 'ஆயிரம்': '1000'
                    };

                    // Tamil fractional words
                    const tamilFractions = {
                        'கால்': '0.25',
                        'அரை': '0.5',
                        'முக்கால்': '0.75'
                    };

                    const words = part.split(/\s+/);
                    let description = [];
                    let qty = '1';

                    const numRegex = /\d+(\.\d+)?/;
                    const qtyWords = ['கிலோ', 'லிட்டர்', 'மீட்டர்', 'டஜன்', 'கூட', 'பேக்', 'பாக்கெட்'];

                    let foundQty = false;

                    for (let i = 0; i < words.length; i++) {
                        const word = words[i].toLowerCase();
                        let number = null;

                        // Number detection
                        if (tamilNumbers[word]) {
                            number = tamilNumbers[word];
                        } else if (numRegex.test(word)) {
                            number = word;
                        } else if (tamilFractions[word]) {
                            number = tamilFractions[word];
                        } else if (word.includes('/') && word.split('/').length === 2 && !isNaN(word.split('/')[0]) && !isNaN(word.split('/')[1])) {
                            const parts = word.split('/');
                            number = (parseFloat(parts[0]) / parseFloat(parts[1])).toString();
                        }

                        // Quantity + unit detection
                        if (number && !foundQty) {
                            const nextWord = words[i + 1] ? words[i + 1].toLowerCase() : '';
                            if (qtyWords.includes(nextWord)) {
                                qty = `${number} ${nextWord}`;
                                foundQty = true;
                                i++; // skip unit word
                                continue;
                            } else {
                                qty = number;
                                foundQty = true;
                                continue;
                            }
                        }

                        // Otherwise, add to description
                        description.push(words[i]);
                    }

                    const cleanedDescription = description.join(' ').trim();

                    if (cleanedDescription.length > 0) {
                        itemCounter++;
                        const newItem = {
                            sNo: itemCounter,
                            description: cleanedDescription,
                            qty: qty,
                        };
                        currentList.push(newItem);
                    }
                });

                displayList();
            }

            // Function to delete an item from the list
            function deleteItem(index) {
                currentList.splice(index, 1);
                // Re-number and re-display the list
                currentList = currentList.map((item, i) => {
                    item.sNo = i + 1;
                    return item;
                });
                displayList();
            }

            // Function to display the list in the table
            function displayList() {
                dataTableBody.innerHTML = '';
                currentList.forEach((item, index) => {
                    const row = document.createElement('tr');
                    row.className = 'hover:bg-gray-50 transition duration-150';
                    row.innerHTML = `
                        <td class="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">${item.sNo}</td>
                        <td class="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 border border-gray-300">${item.description}</td>
                        <td class="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 border border-gray-300">${item.qty}</td>
                        <td class="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium border border-gray-300">
                            <button onclick="deleteItem(${index})" class="text-red-600 hover:text-red-900" title="Delete this item">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 011 1v6a1 1 0 11-2 0V9a1 1 0 011-1z" clip-rule="evenodd" />
                                </svg>
                            </button>
                        </td>
                    `;
                    dataTableBody.appendChild(row);
                });
            }
            
            // Function to save the entire list to IndexedDB
            async function saveListToDb() {
                if (currentList.length === 0) {
                    showModal('There are no items in the list to save.');
                    return;
                }
                const heading = listHeadingInput.value.trim() || 'Untitled List';
                const person = personNameInput.value.trim() || 'Anonymous';
                const reason = reasonInput.value.trim() || 'No reason provided';
                
                const listData = {
                    heading,
                    person,
                    reason,
                    items: currentList,
                    timestamp: new Date().toISOString()
                };

                const transaction = db.transaction([LIST_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(LIST_STORE_NAME);
                
                try {
                    await new Promise((resolve, reject) => {
                        const request = store.add(listData);
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                    showModal(`List "${heading}" saved successfully!`);
                } catch (error) {
                    showModal('Failed to save the list.');
                    console.error('Error saving list to IndexedDB:', error);
                }
            }

            // Function to clear the current list in the table
            function clearCurrentList() {
                currentList = [];
                itemCounter = 0;
                dataTableBody.innerHTML = '';
                listHeadingInput.value = '';
                personNameInput.value = '';
                reasonInput.value = '';
            }
            
            // Function to load and display saved lists from IndexedDB
            async function loadSavedLists() {
                const transaction = db.transaction([LIST_STORE_NAME], 'readonly');
                const store = transaction.objectStore(LIST_STORE_NAME);
                const allLists = await new Promise((resolve, reject) => {
                    const request = store.getAll();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                savedListsContainer.innerHTML = '';
                if (allLists.length === 0) {
                    savedListsContainer.innerHTML = '<p class="text-center text-gray-500">No saved lists found.</p>';
                } else {
                    allLists.forEach(list => {
                        const listCard = document.createElement('div');
                        listCard.className = 'bg-gray-100 p-4 rounded-xl shadow-sm border border-gray-200';
                        listCard.innerHTML = `
                            <div class="flex justify-between items-center mb-2">
                                <h3 class="font-bold text-lg">${list.heading}</h3>
                                <span class="text-xs text-gray-500">${new Date(list.timestamp).toLocaleString()}</span>
                            </div>
                            <p class="text-sm text-gray-700 mb-2"><strong>Person:</strong> ${list.person}</p>
                            <p class="text-sm text-gray-700 mb-2"><strong>Reason:</strong> ${list.reason}</p>
                            <div class="overflow-x-auto mt-2">
                                <table class="w-full text-sm border-collapse border border-gray-300">
                                    <thead>
                                        <tr class="text-left font-medium text-gray-500">
                                            <th class="py-1 border border-gray-300 px-2">S.No</th>
                                            <th class="py-1 border border-gray-300 px-2">Description</th>
                                            <th class="py-1 border border-gray-300 px-2">Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-200">
                                        ${list.items.map(item => `
                                            <tr>
                                                <td class="py-1 border border-gray-300 px-2">${item.sNo}</td>
                                                <td class="py-1 border border-gray-300 px-2">${item.description}</td>
                                                <td class="py-1 border border-gray-300 px-2">${item.qty}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `;
                        savedListsContainer.appendChild(listCard);
                    });
                }
                viewListsModal.classList.remove('hidden');
            }

            // Expose the deleteItem function globally so the onclick event can find it
            window.deleteItem = deleteItem;

            // Event Listeners
            startBtn.addEventListener('click', startSpeechRecognition);
            saveListBtn.addEventListener('click', saveListToDb);
            clearListBtn.addEventListener('click', () => {
                showModal('Are you sure you want to clear the current list? This will not delete saved lists.', 'Clear', 'Cancel').then(confirmed => {
                    if (confirmed) {
                        clearCurrentList();
                    }
                });
            });
            viewListsBtn.addEventListener('click', loadSavedLists);
            closeViewModalBtn.addEventListener('click', () => {
                viewListsModal.classList.add('hidden');
            });

            // Initialize the database on page load
            initDb();
        });
    