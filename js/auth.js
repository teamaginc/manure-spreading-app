// Login/registration handling with LocalStorage

const Auth = {
    storageKey: 'teamag_user',

    // Simple hash function for password (not cryptographically secure, but works for local-only app)
    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    },

    getStoredUser() {
        const userData = localStorage.getItem(this.storageKey);
        return userData ? JSON.parse(userData) : null;
    },

    saveUser(user) {
        localStorage.setItem(this.storageKey, JSON.stringify(user));
    },

    isLoggedIn() {
        const user = this.getStoredUser();
        return user && user.isLoggedIn;
    },

    getCurrentUser() {
        const user = this.getStoredUser();
        if (user && user.isLoggedIn) {
            return {
                email: user.email,
                name: user.name || ''
            };
        }
        return null;
    },

    register(email, password, name = '') {
        const existingUser = this.getStoredUser();

        if (existingUser && existingUser.email === email) {
            return { success: false, error: 'An account with this email already exists.' };
        }

        const user = {
            email: email.toLowerCase().trim(),
            name: name.trim(),
            passwordHash: this.hashPassword(password),
            isLoggedIn: true,
            createdAt: new Date().toISOString()
        };

        this.saveUser(user);

        // Track registration
        if (typeof Tracking !== 'undefined') {
            Tracking.trackRegistration(email);
        }

        return { success: true, user: { email: user.email, name: user.name } };
    },

    login(email, password) {
        const storedUser = this.getStoredUser();

        if (!storedUser) {
            return { success: false, error: 'No account found. Please create an account first.' };
        }

        if (storedUser.email !== email.toLowerCase().trim()) {
            return { success: false, error: 'Invalid email or password.' };
        }

        if (storedUser.passwordHash !== this.hashPassword(password)) {
            return { success: false, error: 'Invalid email or password.' };
        }

        storedUser.isLoggedIn = true;
        this.saveUser(storedUser);

        // Track login
        if (typeof Tracking !== 'undefined') {
            Tracking.trackLogin(email);
        }

        return { success: true, user: { email: storedUser.email, name: storedUser.name } };
    },

    logout() {
        const user = this.getStoredUser();
        if (user) {
            user.isLoggedIn = false;
            this.saveUser(user);
        }
    },

    updateProfile(email, name, newPassword = null) {
        const user = this.getStoredUser();

        if (!user) {
            return { success: false, error: 'No user logged in.' };
        }

        user.email = email.toLowerCase().trim();
        user.name = name.trim();

        if (newPassword && newPassword.length >= 4) {
            user.passwordHash = this.hashPassword(newPassword);
        }

        this.saveUser(user);
        return { success: true };
    },

    deleteAccount() {
        localStorage.removeItem(this.storageKey);
    }
};
