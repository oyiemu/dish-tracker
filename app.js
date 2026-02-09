// ==================== Supabase Configuration ====================
const SUPABASE_URL = 'https://oxkqndqytcypxjlbiigf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fZTg0VRo4Hmi850zJa-n-Q_bQOmekXU';

// VAPID Key for Web Push (public key only - private key is in Supabase Edge Function)
const VAPID_PUBLIC_KEY = 'BNpgKg9wfuDbc34OdTPlQzDNlQ5ntKrQMIJ85tKIuPt1lFpg4LgNgpG6wJGRiukWirRBKZ1vv1UerQlHFSWoiUA';

let supabaseClient;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client initialized successfully');
} catch (error) {
    console.error('Failed to initialize Supabase:', error);
    alert('Failed to connect to database. Please check the console for errors.');
}

// ==================== App State ====================
const LOCAL_KEYS = {
    HOUSEHOLD_ID: 'dishDuty_householdId',
    MY_IDENTITY: 'dishDuty_myIdentity',
    MY_INDEX: 'dishDuty_myIndex',
    NOTIFICATIONS_ENABLED: 'dishDuty_notificationsEnabled',
    NOTIFICATION_TIME: 'dishDuty_notificationTime',
    THEME: 'dishDuty_theme'
};

const PERSON_COLORS = ['#667eea', '#f093fb', '#4facfe', '#43e97b'];

let currentHousehold = null;
let myIdentity = null;
let myIndex = null;
let realtimeSubscription = null;

// ==================== DOM Elements ====================
const elements = {
    // Screens
    loadingScreen: document.getElementById('loading-screen'),
    identityScreen: document.getElementById('identity-screen'),
    setupScreen: document.getElementById('setup-screen'),
    mainScreen: document.getElementById('main-screen'),
    historyScreen: document.getElementById('history-screen'),
    settingsModal: document.getElementById('settings-modal'),

    // Confetti & Toast
    confettiCanvas: document.getElementById('confetti-canvas'),
    toastContainer: document.getElementById('toast-container'),

    // Identity
    identityList: document.getElementById('identity-list'),

    // Setup
    friendInputs: [
        document.getElementById('friend1'),
        document.getElementById('friend2'),
        document.getElementById('friend3'),
        document.getElementById('friend4')
    ],
    todaySelector: document.getElementById('today-selector'),
    notificationTime: document.getElementById('notification-time'),
    startBtn: document.getElementById('start-btn'),

    // Main
    todayCard: document.getElementById('today-card'),
    todayPerson: document.getElementById('today-person'),
    todayDate: document.getElementById('today-date'),
    yourTurnBadge: document.getElementById('your-turn-badge'),
    markDoneBtn: document.getElementById('mark-done-btn'),
    scheduleList: document.getElementById('schedule-list'),
    settingsBtn: document.getElementById('settings-btn'),
    shareBtn: document.getElementById('share-btn'),
    navBtns: document.querySelectorAll('.nav-btn'),

    // History
    historyList: document.getElementById('history-list'),
    emptyHistory: document.getElementById('empty-history'),
    backFromHistory: document.getElementById('back-from-history'),

    // Settings
    closeSettings: document.getElementById('close-settings'),
    currentIdentity: document.getElementById('current-identity'),
    changeIdentity: document.getElementById('change-identity'),
    toggleNotifications: document.getElementById('toggle-notifications'),
    notificationStatus: document.getElementById('notification-status'),
    settingsNotificationTime: document.getElementById('settings-notification-time'),
    testNotification: document.getElementById('test-notification'),
    resetApp: document.getElementById('reset-app'),
    toggleTheme: document.getElementById('toggle-theme'),
    themeStatus: document.getElementById('theme-status')
};

// ==================== Utility Functions ====================
function getLocal(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : defaultValue;
    } catch {
        return defaultValue;
    }
}

function setLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

function formatShortDate(date) {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    }).format(date);
}

function getDaysDiff(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    return Math.floor((d2 - d1) / (24 * 60 * 60 * 1000));
}

function getToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

function getTodayString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ==================== URL Helpers ====================
function getHouseholdIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('h');
}

function setHouseholdIdInUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('h', id);
    window.history.replaceState({}, '', url);
}

function getShareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('h', currentHousehold.id);
    return url.toString();
}

// ==================== Core Logic ====================
function getTodaysDuty() {
    if (!currentHousehold) return null;

    const { friends, start_date, start_index } = currentHousehold;
    const today = getToday();
    const daysSinceStart = getDaysDiff(start_date, today);
    const currentIndex = ((daysSinceStart % 4) + 4) % 4;
    const adjustedIndex = (start_index + currentIndex) % 4;

    return {
        name: friends[adjustedIndex],
        index: adjustedIndex,
        color: PERSON_COLORS[adjustedIndex]
    };
}

function getSchedule(days = 7) {
    if (!currentHousehold) return [];

    const { friends, start_date, start_index } = currentHousehold;
    const schedule = [];
    const today = getToday();

    for (let i = 1; i <= days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);

        const daysSinceStart = getDaysDiff(start_date, date);
        const currentIndex = ((daysSinceStart % 4) + 4) % 4;
        const adjustedIndex = (start_index + currentIndex) % 4;

        schedule.push({
            date,
            name: friends[adjustedIndex],
            index: adjustedIndex,
            color: PERSON_COLORS[adjustedIndex],
            isYou: adjustedIndex === myIndex
        });
    }

    return schedule;
}

// ==================== Supabase Operations ====================
async function loadHousehold(householdId) {
    const { data, error } = await supabaseClient
        .from('households')
        .select('*')
        .eq('id', householdId)
        .single();

    if (error) {
        console.error('Error loading household:', error);
        return null;
    }

    return data;
}

async function createHousehold(friends, startIndex, notificationTime) {
    const { data, error } = await supabaseClient
        .from('households')
        .insert({
            friends,
            start_date: getTodayString(),
            start_index: startIndex,
            notification_time: notificationTime
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating household:', error);
        return null;
    }

    return data;
}

async function loadCompletions() {
    if (!currentHousehold) return [];

    const { data, error } = await supabaseClient
        .from('completions')
        .select('*')
        .eq('household_id', currentHousehold.id)
        .order('completed_at', { ascending: false })
        .limit(30);

    if (error) {
        console.error('Error loading completions:', error);
        return [];
    }

    return data || [];
}

async function getTodaysCompletion() {
    if (!currentHousehold) return null;

    const { data, error } = await supabaseClient
        .from('completions')
        .select('*')
        .eq('household_id', currentHousehold.id)
        .eq('completed_date', getTodayString())
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error checking completion:', error);
    }

    return data;
}

async function markComplete() {
    if (!currentHousehold) return false;

    const duty = getTodaysDuty();

    const { data, error } = await supabaseClient
        .from('completions')
        .insert({
            household_id: currentHousehold.id,
            person_name: duty.name,
            person_index: duty.index,
            completed_date: getTodayString()
        })
        .select()
        .single();

    if (error) {
        console.error('Error marking complete:', error);
        return false;
    }

    // Trigger push notifications via Edge Function
    // We don't await this because we don't want to block the UI
    supabaseClient.functions.invoke('send-push', {
        body: {
            household_id: currentHousehold.id,
            person_name: duty.name,
            exclude_person_index: duty.index
        }
    }).then(({ data, error }) => {
        if (error) console.error('Failed to send push:', error);
        else console.log('Push sent:', data);
    });

    return data;
}

// ==================== Real-time Subscription ====================
function subscribeToCompletions() {
    if (!currentHousehold || realtimeSubscription) return;

    realtimeSubscription = supabaseClient
        .channel('completions-channel')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'completions',
                filter: `household_id=eq.${currentHousehold.id}`
            },
            (payload) => {
                const completion = payload.new;

                // If it's not from me, show a toast notification
                if (completion.person_index !== myIndex) {
                    showToast(
                        '🎉',
                        'Dishes Done!',
                        `${completion.person_name} finished washing the dishes!`
                    );

                    // Send browser notification too
                    if (Notification.permission === 'granted') {
                        new Notification('🎉 Dishes Done!', {
                            body: `${completion.person_name} finished washing the dishes!`,
                            icon: 'icons/icon-192.svg'
                        });
                    }
                }

                // Update the UI
                updateMainScreen();
            }
        )
        .subscribe();
}

// ==================== UI: Screens ====================
function hideAllScreens() {
    elements.loadingScreen.classList.add('hidden');
    elements.identityScreen.classList.add('hidden');
    elements.setupScreen.classList.add('hidden');
    elements.mainScreen.classList.add('hidden');
    elements.historyScreen.classList.add('hidden');
}

function showScreen(screenName) {
    hideAllScreens();

    switch (screenName) {
        case 'loading':
            elements.loadingScreen.classList.remove('hidden');
            break;
        case 'identity':
            elements.identityScreen.classList.remove('hidden');
            renderIdentityPicker();
            break;
        case 'setup':
            elements.setupScreen.classList.remove('hidden');
            updateTodaySelector();
            break;
        case 'main':
            elements.mainScreen.classList.remove('hidden');
            updateMainScreen();
            subscribeToCompletions();
            break;
        case 'history':
            elements.historyScreen.classList.remove('hidden');
            updateHistoryScreen();
            break;
    }
}

// ==================== UI: Identity Picker ====================
function renderIdentityPicker() {
    if (!currentHousehold) return;

    elements.identityList.innerHTML = currentHousehold.friends.map((name, index) => `
        <div class="identity-option" data-index="${index}" style="--person-color: ${PERSON_COLORS[index]}">
            <div class="identity-avatar">${name.charAt(0).toUpperCase()}</div>
            <span class="identity-name">${name}</span>
        </div>
    `).join('');

    // Add click handlers
    elements.identityList.querySelectorAll('.identity-option').forEach(option => {
        option.addEventListener('click', async () => {
            const index = parseInt(option.dataset.index);
            myIndex = index;
            myIdentity = currentHousehold.friends[index];
            setLocal(LOCAL_KEYS.MY_INDEX, myIndex);
            setLocal(LOCAL_KEYS.MY_IDENTITY, myIdentity);

            // Subscribe to push notifications
            await subscribeToPush();

            showScreen('main');
        });
    });
}

// ==================== UI: Main Screen ====================
async function updateMainScreen() {
    const duty = getTodaysDuty();
    if (!duty) return;

    // Update today's card
    elements.todayPerson.textContent = duty.name;
    elements.todayDate.textContent = formatDate(new Date());
    elements.todayCard.style.setProperty('--person-color', duty.color);

    // Show "your turn" badge if it's the current user
    if (duty.index === myIndex) {
        elements.yourTurnBadge.classList.remove('hidden');
    } else {
        elements.yourTurnBadge.classList.add('hidden');
    }

    // Check if today is completed
    const completion = await getTodaysCompletion();
    const isDone = !!completion;

    if (isDone) {
        elements.markDoneBtn.classList.add('completed');
        elements.markDoneBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Completed by ${completion.person_name}!</span>
        `;
    } else {
        elements.markDoneBtn.classList.remove('completed');
        elements.markDoneBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Mark as Done</span>
        `;
    }

    // Update schedule
    const schedule = getSchedule(5);
    elements.scheduleList.innerHTML = schedule.map(item => `
        <div class="schedule-item ${item.isYou ? 'is-you' : ''}" style="--person-color: ${item.color}">
            <span class="schedule-day">${formatShortDate(item.date)}</span>
            <span class="schedule-name">${item.name}</span>
            ${item.isYou ? '<span class="schedule-you-tag">YOU</span>' : ''}
        </div>
    `).join('');

    // Update settings identity display
    elements.currentIdentity.textContent = myIdentity || 'Not set';

    // Update nav
    elements.navBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === 'home');
    });
}

// ==================== UI: History Screen ====================
async function updateHistoryScreen() {
    const completions = await loadCompletions();

    if (completions.length === 0) {
        elements.historyList.classList.add('hidden');
        elements.emptyHistory.classList.remove('hidden');
        return;
    }

    elements.historyList.classList.remove('hidden');
    elements.emptyHistory.classList.add('hidden');

    elements.historyList.innerHTML = completions.map(item => {
        const date = new Date(item.completed_date);
        const color = PERSON_COLORS[item.person_index];
        const initial = item.person_name.charAt(0).toUpperCase();

        return `
            <div class="history-item">
                <div class="history-avatar" style="--person-color: ${color}; background: ${color}">
                    ${initial}
                </div>
                <div class="history-info">
                    <div class="history-name">${item.person_name}</div>
                    <div class="history-date">${formatShortDate(date)}</div>
                </div>
                <div class="history-status">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== UI: Setup Screen ====================
function updateTodaySelector() {
    const names = elements.friendInputs.map(input => input.value.trim());
    const filledCount = names.filter(n => n).length;

    // Preserve selected
    const currentlySelected = elements.todaySelector.querySelector('.selected');
    const selectedIndex = currentlySelected ? currentlySelected.dataset.index : null;

    elements.todaySelector.innerHTML = names.map((name, index) => {
        const isDisabled = !name;
        const isSelected = selectedIndex === String(index) && !isDisabled;
        const color = PERSON_COLORS[index];
        return `
            <button 
                class="today-option ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}" 
                data-index="${index}"
                style="--person-color: ${color}"
                ${isDisabled ? 'disabled' : ''}
            >
                ${name || `Friend ${index + 1}`}
            </button>
        `;
    }).join('');

    const hasSelection = elements.todaySelector.querySelector('.selected');
    elements.startBtn.disabled = filledCount < 4 || !hasSelection;
}

// ==================== UI: Settings ====================
function updateSettingsModal() {
    const enabled = getLocal(LOCAL_KEYS.NOTIFICATIONS_ENABLED, false);
    const time = getLocal(LOCAL_KEYS.NOTIFICATION_TIME, '18:00');

    if (enabled) {
        elements.toggleNotifications.classList.add('active');
        elements.notificationStatus.textContent = 'Notifications enabled';
    } else {
        elements.toggleNotifications.classList.remove('active');
        elements.notificationStatus.textContent = 'Enable daily reminders';
    }

    elements.settingsNotificationTime.value = time;
    elements.currentIdentity.textContent = myIdentity || 'Not set';
}

// ==================== Toast Notifications ====================
function showToast(icon, title, message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    elements.toastContainer.appendChild(toast);

    // Remove after animation
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// ==================== Confetti ====================
function launchConfetti() {
    const canvas = elements.confettiCanvas;
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = PERSON_COLORS;

    // Create particles
    for (let i = 0; i < 150; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 20 - 10,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 8 + 4,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10
        });
    }

    let frame = 0;
    const maxFrames = 120;

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.5; // gravity
            p.rotation += p.rotationSpeed;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        });

        frame++;
        if (frame < maxFrames) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    animate();
}

// ==================== Browser Notifications ====================
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }

    return false;
}

function showTestNotification() {
    const duty = getTodaysDuty();
    if (Notification.permission === 'granted') {
        new Notification('🍽️ Dish Duty Reminder', {
            body: `It's ${duty?.name || 'someone'}'s turn to wash the dishes!`,
            icon: 'icons/icon-192.svg'
        });
    }
}

// ==================== Event Handlers ====================
function initSetupEvents() {
    elements.friendInputs.forEach(input => {
        input.addEventListener('input', updateTodaySelector);
    });

    elements.todaySelector.addEventListener('click', (e) => {
        const option = e.target.closest('.today-option');
        if (!option || option.disabled) return;

        document.querySelectorAll('.today-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        updateTodaySelector();
    });

    elements.startBtn.addEventListener('click', async () => {
        const friends = elements.friendInputs.map(input => input.value.trim());
        const selectedOption = elements.todaySelector.querySelector('.selected');
        const startIndex = parseInt(selectedOption.dataset.index);
        const notificationTime = elements.notificationTime.value;

        showScreen('loading');

        // Create household in Supabase
        const household = await createHousehold(friends, startIndex, notificationTime);

        if (!household) {
            alert('Failed to create household. Please try again.');
            showScreen('setup');
            return;
        }

        currentHousehold = household;
        setLocal(LOCAL_KEYS.HOUSEHOLD_ID, household.id);
        setHouseholdIdInUrl(household.id);

        // Request notification permission
        const granted = await requestNotificationPermission();
        setLocal(LOCAL_KEYS.NOTIFICATIONS_ENABLED, granted);
        setLocal(LOCAL_KEYS.NOTIFICATION_TIME, notificationTime);

        // Show identity picker so user can select WHO THEY ARE
        showScreen('identity');
    });
}

function initMainEvents() {
    elements.settingsBtn.addEventListener('click', () => {
        updateSettingsModal();
        elements.settingsModal.classList.remove('hidden');
    });

    elements.markDoneBtn.addEventListener('click', async () => {
        const completion = await getTodaysCompletion();
        if (completion) return; // Already done

        const result = await markComplete();
        if (result) {
            launchConfetti();
            showToast('🎉', 'Great job!', 'You finished the dishes!');
            updateMainScreen();
        }
    });

    elements.shareBtn.addEventListener('click', async () => {
        const shareUrl = getShareUrl();

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Dish Duty',
                    text: 'Join our dish duty rotation!',
                    url: shareUrl
                });
            } catch (err) {
                // User cancelled or error
            }
        } else {
            // Fallback: copy to clipboard
            try {
                await navigator.clipboard.writeText(shareUrl);
                showToast('📋', 'Link Copied!', 'Share this link with your friends');
            } catch (err) {
                prompt('Copy this link:', shareUrl);
            }
        }
    });

    elements.navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view === 'history') {
                showScreen('history');
            } else {
                showScreen('main');
            }
        });
    });
}

function initHistoryEvents() {
    elements.backFromHistory.addEventListener('click', () => {
        showScreen('main');
    });
}

function initSettingsEvents() {
    elements.closeSettings.addEventListener('click', () => {
        elements.settingsModal.classList.add('hidden');
    });

    elements.settingsModal.querySelector('.modal-backdrop').addEventListener('click', () => {
        elements.settingsModal.classList.add('hidden');
    });

    elements.changeIdentity.addEventListener('click', () => {
        elements.settingsModal.classList.add('hidden');
        showScreen('identity');
    });

    elements.toggleNotifications.addEventListener('click', async () => {
        const currentlyEnabled = getLocal(LOCAL_KEYS.NOTIFICATIONS_ENABLED, false);

        if (currentlyEnabled) {
            setLocal(LOCAL_KEYS.NOTIFICATIONS_ENABLED, false);
        } else {
            const granted = await requestNotificationPermission();
            setLocal(LOCAL_KEYS.NOTIFICATIONS_ENABLED, granted);
        }

        updateSettingsModal();
    });

    elements.settingsNotificationTime.addEventListener('change', () => {
        const time = elements.settingsNotificationTime.value;
        setLocal(LOCAL_KEYS.NOTIFICATION_TIME, time);
    });

    elements.testNotification.addEventListener('click', async () => {
        if (Notification.permission !== 'granted') {
            await requestNotificationPermission();
        }
        showTestNotification();
    });

    elements.resetApp.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset? You will need to re-select your identity.')) {
            Object.values(LOCAL_KEYS).forEach(key => localStorage.removeItem(key));
            window.location.href = window.location.pathname; // Remove query params
        }
    });

    // Theme toggle
    elements.toggleTheme.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-mode');
        setLocal(LOCAL_KEYS.THEME, isLight ? 'light' : 'dark');
        updateThemeUI();
    });
}

// ==================== Theme Functions ====================
function updateThemeUI() {
    const isLight = document.body.classList.contains('light-mode');
    elements.themeStatus.textContent = isLight ? 'Light mode' : 'Dark mode';
    if (isLight) {
        elements.toggleTheme.classList.add('active');
    } else {
        elements.toggleTheme.classList.remove('active');
    }
}

function initTheme() {
    const savedTheme = getLocal(LOCAL_KEYS.THEME, 'dark');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
    updateThemeUI();
}

// ==================== Push Notifications ====================
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications not supported');
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.ready;

        // Check if already subscribed
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            // Subscribe to push
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        // Save subscription to Supabase
        if (currentHousehold && myIndex !== null) {
            const subJson = subscription.toJSON();

            const { error } = await supabaseClient
                .from('push_subscriptions')
                .upsert({
                    household_id: currentHousehold.id,
                    person_index: myIndex,
                    endpoint: subJson.endpoint,
                    p256dh: subJson.keys.p256dh,
                    auth: subJson.keys.auth
                }, {
                    onConflict: 'household_id,person_index,endpoint'
                });

            if (error) {
                console.error('Failed to save push subscription:', error);
            } else {
                console.log('Push subscription saved to Supabase');
            }
        }

        return true;
    } catch (error) {
        console.error('Failed to subscribe to push:', error);
        return false;
    }
}

// ==================== Service Worker ====================
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('sw.js');
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

// ==================== Initialization ====================
async function init() {
    console.log('Init started');

    try {
        registerServiceWorker();
        console.log('Service worker registered');

        initSetupEvents();
        initMainEvents();
        initHistoryEvents();
        initSettingsEvents();
        initTheme();
        console.log('Events initialized');

        showScreen('loading');
        console.log('Loading screen shown');

        // Check for household ID in URL or local storage
        let householdId = getHouseholdIdFromUrl() || getLocal(LOCAL_KEYS.HOUSEHOLD_ID);
        console.log('Household ID:', householdId);

        if (householdId) {
            // Load existing household
            console.log('Loading household from Supabase...');
            currentHousehold = await loadHousehold(householdId);
            console.log('Household loaded:', currentHousehold);

            if (currentHousehold) {
                setLocal(LOCAL_KEYS.HOUSEHOLD_ID, currentHousehold.id);
                setHouseholdIdInUrl(currentHousehold.id);

                // Check if we have an identity
                myIndex = getLocal(LOCAL_KEYS.MY_INDEX);
                myIdentity = getLocal(LOCAL_KEYS.MY_IDENTITY);
                console.log('Identity:', myIdentity, 'Index:', myIndex);

                if (myIndex !== null && myIdentity) {
                    showScreen('main');
                } else {
                    showScreen('identity');
                }
            } else {
                // Invalid household ID - clear it and show setup
                console.log('Invalid household ID, showing setup');
                localStorage.removeItem(LOCAL_KEYS.HOUSEHOLD_ID);
                showScreen('setup');
            }
        } else {
            // New user, show setup
            console.log('No household ID, showing setup');
            showScreen('setup');
        }
    } catch (error) {
        console.error('Init error:', error);
        alert('Error initializing app: ' + error.message);
        showScreen('setup');
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

