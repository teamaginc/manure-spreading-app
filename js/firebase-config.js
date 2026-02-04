// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, orderBy, addDoc, updateDoc, limit, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBezCZGxdeqdnLbcsGO8TOujHhFL6G2omQ",
    authDomain: "teamag-manure-spreading.firebaseapp.com",
    projectId: "teamag-manure-spreading",
    storageBucket: "teamag-manure-spreading.firebasestorage.app",
    messagingSenderId: "1035219208993",
    appId: "1:1035219208993:web:404e7cba69561796558c60"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Auth functions
const FirebaseAuth = {
    currentUser: null,

    // Listen for auth state changes
    init(callback) {
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            if (callback) callback(user);
        });
    },

    isLoggedIn() {
        return this.currentUser !== null;
    },

    getCurrentUser() {
        if (!this.currentUser) return null;
        return {
            uid: this.currentUser.uid,
            email: this.currentUser.email,
            name: this.currentUser.displayName || ''
        };
    },

    async register(email, password, name = '') {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);

            // Update display name if provided
            if (name) {
                await updateProfile(userCredential.user, { displayName: name });
            }

            // Create user document in Firestore
            const role = email.toLowerCase() === 'erics@teamaginc.com' ? 'superadmin' : 'farmer';
            await setDoc(doc(db, "users", userCredential.user.uid), {
                email: email,
                name: name,
                role: role,
                features: { fieldShapefiles: false },
                createdAt: new Date().toISOString()
            });

            // Track registration
            if (typeof Tracking !== 'undefined') {
                Tracking.trackRegistration(email);
            }

            return {
                success: true,
                user: {
                    uid: userCredential.user.uid,
                    email: email,
                    name: name
                }
            };
        } catch (error) {
            console.error('Registration error:', error);
            let message = 'Registration failed.';
            if (error.code === 'auth/email-already-in-use') {
                message = 'An account with this email already exists.';
            } else if (error.code === 'auth/weak-password') {
                message = 'Password should be at least 6 characters.';
            } else if (error.code === 'auth/invalid-email') {
                message = 'Invalid email address.';
            }
            return { success: false, error: message };
        }
    },

    async login(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);

            // Track login
            if (typeof Tracking !== 'undefined') {
                Tracking.trackLogin(email);
            }

            // Update last login timestamp
            try {
                await FirebaseAdmin.updateLastLogin(userCredential.user.uid);
            } catch (e) {
                console.log('Failed to update last login:', e);
            }

            return {
                success: true,
                user: {
                    uid: userCredential.user.uid,
                    email: userCredential.user.email,
                    name: userCredential.user.displayName || ''
                }
            };
        } catch (error) {
            console.error('Login error:', error);
            let message = 'Invalid email or password.';
            if (error.code === 'auth/user-not-found') {
                message = 'No account found with this email.';
            } else if (error.code === 'auth/wrong-password') {
                message = 'Invalid email or password.';
            }
            return { success: false, error: message };
        }
    },

    async logout() {
        try {
            await signOut(auth);
            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            return { success: false, error: error.message };
        }
    },

    async updateProfile(name) {
        try {
            if (this.currentUser) {
                await updateProfile(this.currentUser, { displayName: name });

                // Update Firestore document
                await setDoc(doc(db, "users", this.currentUser.uid), {
                    name: name
                }, { merge: true });
            }
            return { success: true };
        } catch (error) {
            console.error('Update profile error:', error);
            return { success: false, error: error.message };
        }
    }
};

// Firestore database functions
const FirebaseDB = {
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    async saveLog(log) {
        const user = FirebaseAuth.getCurrentUser();
        if (!user) {
            throw new Error('User not logged in');
        }

        const logId = log.id || this.generateId();
        const logWithMeta = {
            ...log,
            id: logId,
            userId: user.uid,
            date: new Date(log.timestamp).toISOString().split('T')[0],
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, "users", user.uid, "logs", logId), logWithMeta);
        console.log('Log saved to Firestore:', logId);
        return logWithMeta;
    },

    async getAllLogs() {
        const user = FirebaseAuth.getCurrentUser();
        if (!user) {
            return [];
        }

        try {
            const logsRef = collection(db, "users", user.uid, "logs");
            const q = query(logsRef, orderBy("timestamp", "desc"));
            const snapshot = await getDocs(q);

            const logs = [];
            snapshot.forEach((doc) => {
                logs.push(doc.data());
            });
            return logs;
        } catch (error) {
            console.error('Error getting logs:', error);
            return [];
        }
    },

    async getLogsByDate(date) {
        const user = FirebaseAuth.getCurrentUser();
        if (!user) {
            return [];
        }

        try {
            const logsRef = collection(db, "users", user.uid, "logs");
            const q = query(logsRef, where("date", "==", date), orderBy("timestamp", "desc"));
            const snapshot = await getDocs(q);

            const logs = [];
            snapshot.forEach((doc) => {
                logs.push(doc.data());
            });
            return logs;
        } catch (error) {
            console.error('Error getting logs by date:', error);
            return [];
        }
    },

    async getTodaysLogs() {
        const today = new Date().toISOString().split('T')[0];
        return this.getLogsByDate(today);
    },

    async getLogById(id) {
        const user = FirebaseAuth.getCurrentUser();
        if (!user) {
            return null;
        }

        try {
            const docRef = doc(db, "users", user.uid, "logs", id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data();
            }
            return null;
        } catch (error) {
            console.error('Error getting log by id:', error);
            return null;
        }
    },

    async updateLog(logId, updatedData) {
        const user = FirebaseAuth.getCurrentUser();
        if (!user) {
            throw new Error('User not logged in');
        }

        await setDoc(doc(db, "users", user.uid, "logs", logId), {
            ...updatedData,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log('Log updated in Firestore:', logId);
    },

    async deleteLog(id) {
        const user = FirebaseAuth.getCurrentUser();
        if (!user) {
            throw new Error('User not logged in');
        }

        await deleteDoc(doc(db, "users", user.uid, "logs", id));
        console.log('Log deleted:', id);
    }
};

// Admin functions
const FirebaseAdmin = {
    async getAllUsers() {
        try {
            const snapshot = await getDocs(collection(db, "users"));
            const users = [];
            snapshot.forEach(d => users.push({ uid: d.id, ...d.data() }));
            return users;
        } catch (e) {
            console.error('getAllUsers error:', e);
            return [];
        }
    },

    async getUserDoc(userId) {
        try {
            const snap = await getDoc(doc(db, "users", userId));
            return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
        } catch (e) {
            console.error('getUserDoc error:', e);
            return null;
        }
    },

    async createFarmerAccount(email, password, name) {
        // Save current admin credentials to re-auth after
        const adminUser = auth.currentUser;
        const adminEmail = adminUser.email;

        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            if (name) await updateProfile(cred.user, { displayName: name });

            await setDoc(doc(db, "users", cred.user.uid), {
                email: email,
                name: name || '',
                role: 'farmer',
                features: { fieldShapefiles: false },
                createdAt: new Date().toISOString()
            });

            // Firebase signs in as new user; sign out and re-auth admin
            await signOut(auth);
            // We can't re-auth without the admin password, so prompt
            const adminPassword = prompt('Creating the farmer account signed you out (Firebase limitation). Enter your admin password to re-authenticate:');
            if (adminPassword) {
                await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
            }
        } catch (e) {
            // Try to re-authenticate admin if something failed
            console.error('createFarmerAccount error:', e);
            throw e;
        }
    },

    async updateUserRole(userId, role) {
        await setDoc(doc(db, "users", userId), { role }, { merge: true });
    },

    async updateUserFeatures(userId, features) {
        await setDoc(doc(db, "users", userId), { features }, { merge: true });
    },

    // IMPORTANT: GeoJSON must be stored as a JSON string (geojsonStr), not a raw object.
    // Firestore does not support nested arrays, and GeoJSON coordinates are nested arrays.
    async saveFieldData(userId, fieldData) {
        const fieldId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        const data = {
            id: fieldId,
            name: fieldData.name,
            uploadedAt: new Date().toISOString(),
            uploadedBy: auth.currentUser ? auth.currentUser.uid : 'unknown',
            geojsonStr: JSON.stringify(fieldData.geojson),
            metadata: fieldData.metadata || {}
        };
        await setDoc(doc(db, "users", userId, "fields", fieldId), data);
        data.geojson = fieldData.geojson;
        return data;
    },

    async getUserFields(userId) {
        try {
            const snapshot = await getDocs(collection(db, "users", userId, "fields"));
            const fields = [];
            snapshot.forEach(d => {
                const data = d.data();
                if (data.geojsonStr && !data.geojson) {
                    data.geojson = JSON.parse(data.geojsonStr);
                }
                fields.push(data);
            });
            return fields;
        } catch (e) {
            console.error('getUserFields error:', e);
            return [];
        }
    },

    async deleteField(userId, fieldId) {
        await deleteDoc(doc(db, "users", userId, "fields", fieldId));
    },

    async getGlobalFeatures() {
        try {
            const snap = await getDoc(doc(db, "config", "features"));
            return snap.exists() ? snap.data() : {};
        } catch (e) {
            console.error('getGlobalFeatures error:', e);
            return {};
        }
    },

    async updateGlobalFeatures(data) {
        await setDoc(doc(db, "config", "features"), data, { merge: true });
    },

    async isAdmin() {
        const user = FirebaseAuth.getCurrentUser();
        if (!user) return false;
        const userDoc = await this.getUserDoc(user.uid);
        return userDoc && (userDoc.role === 'admin' || userDoc.role === 'superadmin');
    },

    async getAllFarms() {
        try {
            const snapshot = await getDocs(collection(db, "farms"));
            const farms = [];
            snapshot.forEach(d => farms.push({ id: d.id, ...d.data() }));
            return farms;
        } catch (e) {
            console.error('getAllFarms error:', e);
            return [];
        }
    },

    async assignUserToFarm(userId, farmId) {
        // Set farmId on user doc
        await setDoc(doc(db, "users", userId), { farmId: farmId }, { merge: true });
        // Add as member if not already
        const userDoc = await this.getUserDoc(userId);
        const members = await getDocs(collection(db, "farms", farmId, "members"));
        let alreadyMember = false;
        members.forEach(d => { if (d.id === userId) alreadyMember = true; });
        if (!alreadyMember) {
            await setDoc(doc(db, "farms", farmId, "members", userId), {
                userId: userId,
                email: userDoc ? userDoc.email : '',
                name: userDoc ? userDoc.name || '' : '',
                role: 'member',
                joinedAt: new Date().toISOString()
            });
        }
    },

    async removeUserFromFarm(userId, farmId) {
        // Unset farmId on user doc
        await setDoc(doc(db, "users", userId), { farmId: '' }, { merge: true });
        // Remove member doc
        await deleteDoc(doc(db, "farms", farmId, "members", userId));
    },

    async transferFarmOwnership(farmId, fromUserId, toUserId) {
        // Set old owner to member
        await setDoc(doc(db, "farms", farmId, "members", fromUserId), { role: 'member' }, { merge: true });
        // Set new owner
        await setDoc(doc(db, "farms", farmId, "members", toUserId), { role: 'owner' }, { merge: true });
    },

    async getUserLogs(userId) {
        try {
            const logsRef = collection(db, "users", userId, "logs");
            const q = query(logsRef, orderBy("timestamp", "desc"));
            const snapshot = await getDocs(q);
            const logs = [];
            snapshot.forEach(d => logs.push(d.data()));
            return logs;
        } catch (e) {
            console.error('getUserLogs error:', e);
            return [];
        }
    },

    async getFarmMembers(farmId) {
        try {
            const snapshot = await getDocs(collection(db, "farms", farmId, "members"));
            const members = [];
            snapshot.forEach(d => members.push(d.data()));
            return members;
        } catch (e) {
            console.error('getFarmMembers error:', e);
            return [];
        }
    },

    // ==================== ACTIVITY LOGGING ====================

    async logActivity(eventType, details = {}) {
        try {
            const user = FirebaseAuth.getCurrentUser();
            const logEntry = {
                timestamp: new Date().toISOString(),
                eventType: eventType,
                userId: user ? user.uid : null,
                userEmail: user ? user.email : null,
                details: details,
                userAgent: navigator.userAgent
            };
            await addDoc(collection(db, "activity_log"), logEntry);
        } catch (e) {
            console.error('logActivity error:', e);
        }
    },

    async getActivityLogs(options = {}) {
        try {
            const { eventType, userId, startDate, endDate, pageSize = 50, lastDoc } = options;
            let q = collection(db, "activity_log");
            const constraints = [orderBy("timestamp", "desc")];

            if (eventType) {
                constraints.unshift(where("eventType", "==", eventType));
            }
            if (userId) {
                constraints.unshift(where("userId", "==", userId));
            }

            constraints.push(limit(pageSize));
            q = query(q, ...constraints);

            const snapshot = await getDocs(q);
            const logs = [];
            snapshot.forEach(d => logs.push({ id: d.id, ...d.data() }));

            // Filter by date in JS since Firestore can't do compound inequalities easily
            let filtered = logs;
            if (startDate) {
                filtered = filtered.filter(l => l.timestamp >= startDate);
            }
            if (endDate) {
                filtered = filtered.filter(l => l.timestamp <= endDate);
            }

            return filtered;
        } catch (e) {
            console.error('getActivityLogs error:', e);
            return [];
        }
    },

    // ==================== USER STATUS MANAGEMENT ====================

    async updateUserStatus(userId, status) {
        try {
            await setDoc(doc(db, "users", userId), { accountStatus: status }, { merge: true });
            await this.logActivity('user_status_change', { targetUserId: userId, newStatus: status });
        } catch (e) {
            console.error('updateUserStatus error:', e);
            throw e;
        }
    },

    async updateLastLogin(userId) {
        try {
            await setDoc(doc(db, "users", userId), {
                lastLoginAt: new Date().toISOString(),
                loginCount: (await this.getUserDoc(userId))?.loginCount + 1 || 1
            }, { merge: true });
        } catch (e) {
            console.error('updateLastLogin error:', e);
        }
    },

    // ==================== BULK INVITES ====================

    async sendBulkInvites(emails, farmId, role = 'member') {
        const results = [];
        for (const email of emails) {
            try {
                const trimmedEmail = email.trim().toLowerCase();
                if (!trimmedEmail || !trimmedEmail.includes('@')) {
                    results.push({ email: trimmedEmail, success: false, error: 'Invalid email' });
                    continue;
                }

                const inviteId = Date.now().toString(36) + Math.random().toString(36).substr(2);
                await setDoc(doc(db, "invites", inviteId), {
                    id: inviteId,
                    invitedEmail: trimmedEmail,
                    farmId: farmId,
                    role: role,
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    createdBy: FirebaseAuth.getCurrentUser()?.uid || null
                });
                results.push({ email: trimmedEmail, success: true });
            } catch (e) {
                results.push({ email, success: false, error: e.message });
            }
        }
        await this.logActivity('bulk_invite', { count: emails.length, farmId });
        return results;
    },

    // ==================== ANALYTICS ====================

    async getSpreadingStats(period = 'all') {
        try {
            const users = await this.getAllUsers();
            let totalRecords = 0;
            let totalAcres = 0;
            let totalRate = 0;
            let rateCount = 0;
            const farmActivity = {};
            const userActivity = {};

            const now = new Date();
            let startDate = null;

            if (period === 'month') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            } else if (period === 'season') {
                // Current season: spring (Mar-Aug), fall (Sep-Feb)
                const month = now.getMonth();
                if (month >= 2 && month <= 7) {
                    startDate = new Date(now.getFullYear(), 2, 1); // March 1
                } else if (month >= 8) {
                    startDate = new Date(now.getFullYear(), 8, 1); // Sep 1
                } else {
                    startDate = new Date(now.getFullYear() - 1, 8, 1); // Sep 1 of prev year
                }
            } else if (period === 'year') {
                startDate = new Date(now.getFullYear(), 0, 1);
            }

            for (const user of users) {
                try {
                    const logs = await this.getUserLogs(user.uid);
                    for (const log of logs) {
                        if (startDate && new Date(log.timestamp) < startDate) continue;

                        totalRecords++;

                        // Calculate acres from path if available
                        if (log.path && log.path.length > 0 && log.spreadWidth) {
                            // Rough estimation: sum of distances * width / 43560 (sq ft per acre)
                            let pathLength = 0;
                            for (let i = 1; i < log.path.length; i++) {
                                const p1 = log.path[i - 1];
                                const p2 = log.path[i];
                                pathLength += this.calcDistanceFt(p1.lat, p1.lng, p2.lat, p2.lng);
                            }
                            const acres = (pathLength * log.spreadWidth) / 43560;
                            totalAcres += acres;
                        }

                        if (log.targetRate) {
                            totalRate += log.targetRate;
                            rateCount++;
                        }

                        // Track by farm
                        const farmId = user.farmId || 'no-farm';
                        farmActivity[farmId] = (farmActivity[farmId] || 0) + 1;

                        // Track by user
                        userActivity[user.uid] = {
                            email: user.email,
                            name: user.name,
                            count: (userActivity[user.uid]?.count || 0) + 1
                        };
                    }
                } catch (e) {
                    // Skip users with errors
                }
            }

            // Get farm names for top farms
            const topFarms = await Promise.all(
                Object.entries(farmActivity)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(async ([farmId, count]) => {
                        if (farmId === 'no-farm') return { name: 'No Farm', count };
                        const farm = await FirebaseFarm.getFarm(farmId);
                        return { name: farm?.name || 'Unknown', count };
                    })
            );

            const topUsers = Object.values(userActivity)
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            return {
                totalRecords,
                totalAcres: Math.round(totalAcres * 10) / 10,
                averageRate: rateCount > 0 ? Math.round(totalRate / rateCount) : 0,
                topFarms,
                topUsers
            };
        } catch (e) {
            console.error('getSpreadingStats error:', e);
            return { totalRecords: 0, totalAcres: 0, averageRate: 0, topFarms: [], topUsers: [] };
        }
    },

    calcDistanceFt(lat1, lng1, lat2, lng2) {
        const R = 20902231; // Earth radius in feet
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    async getSystemStats() {
        try {
            const [users, farms] = await Promise.all([
                this.getAllUsers(),
                this.getAllFarms()
            ]);

            let totalFields = 0;
            let totalRecords = 0;

            for (const farm of farms) {
                try {
                    const fields = await FirebaseFarm.getFarmFields(farm.id);
                    totalFields += fields.length;
                } catch (e) {}
            }

            for (const user of users) {
                try {
                    const logs = await this.getUserLogs(user.uid);
                    totalRecords += logs.length;
                } catch (e) {}
            }

            return {
                userCount: users.length,
                farmCount: farms.length,
                fieldCount: totalFields,
                recordCount: totalRecords
            };
        } catch (e) {
            console.error('getSystemStats error:', e);
            return { userCount: 0, farmCount: 0, fieldCount: 0, recordCount: 0 };
        }
    },

    // ==================== GLOBAL SEARCH ====================

    async globalSearch(queryStr) {
        const results = { users: [], farms: [], fields: [] };
        const q = queryStr.toLowerCase().trim();
        if (!q) return results;

        try {
            // Search users
            const users = await this.getAllUsers();
            results.users = users.filter(u =>
                (u.email && u.email.toLowerCase().includes(q)) ||
                (u.name && u.name.toLowerCase().includes(q))
            ).slice(0, 10);

            // Search farms
            const farms = await this.getAllFarms();
            results.farms = farms.filter(f =>
                f.name && f.name.toLowerCase().includes(q)
            ).slice(0, 10);

            // Search fields across all farms
            for (const farm of farms) {
                try {
                    const fields = await FirebaseFarm.getFarmFields(farm.id);
                    const matching = fields.filter(f =>
                        f.name && f.name.toLowerCase().includes(q)
                    ).map(f => ({ ...f, farmId: farm.id, farmName: farm.name }));
                    results.fields.push(...matching);
                } catch (e) {}
            }
            results.fields = results.fields.slice(0, 10);

        } catch (e) {
            console.error('globalSearch error:', e);
        }

        return results;
    },

    // ==================== ANNOUNCEMENTS ====================

    async createAnnouncement(data) {
        try {
            const announcementId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            const announcement = {
                id: announcementId,
                title: data.title,
                message: data.message,
                type: data.type || 'info', // info, feature, warning, maintenance
                priority: data.priority || 0,
                active: true,
                dismissible: data.dismissible !== false,
                createdAt: new Date().toISOString(),
                expiresAt: data.expiresAt || null,
                createdBy: FirebaseAuth.getCurrentUser()?.uid || null
            };
            await setDoc(doc(db, "announcements", announcementId), announcement);
            await this.logActivity('announcement_create', { announcementId, title: data.title });
            return announcement;
        } catch (e) {
            console.error('createAnnouncement error:', e);
            throw e;
        }
    },

    async getActiveAnnouncements() {
        try {
            const q = query(
                collection(db, "announcements"),
                where("active", "==", true),
                orderBy("priority", "desc")
            );
            const snapshot = await getDocs(q);
            const announcements = [];
            const now = new Date().toISOString();

            snapshot.forEach(d => {
                const data = d.data();
                // Filter out expired announcements
                if (!data.expiresAt || data.expiresAt > now) {
                    announcements.push(data);
                }
            });

            return announcements;
        } catch (e) {
            console.error('getActiveAnnouncements error:', e);
            return [];
        }
    },

    async getAllAnnouncements() {
        try {
            const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);
            const announcements = [];
            snapshot.forEach(d => announcements.push(d.data()));
            return announcements;
        } catch (e) {
            console.error('getAllAnnouncements error:', e);
            return [];
        }
    },

    async updateAnnouncement(announcementId, data) {
        try {
            await setDoc(doc(db, "announcements", announcementId), {
                ...data,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            await this.logActivity('announcement_update', { announcementId });
        } catch (e) {
            console.error('updateAnnouncement error:', e);
            throw e;
        }
    },

    async deleteAnnouncement(announcementId) {
        try {
            await deleteDoc(doc(db, "announcements", announcementId));
            await this.logActivity('announcement_delete', { announcementId });
        } catch (e) {
            console.error('deleteAnnouncement error:', e);
            throw e;
        }
    },

    // ==================== APP SETTINGS ====================

    async getAppSettings() {
        try {
            const snap = await getDoc(doc(db, "config", "settings"));
            if (snap.exists()) {
                return snap.data();
            }
            // Return defaults
            return {
                defaultSpreadWidth: 50,
                rateUnits: 'gal/ac',
                seasonBoundaries: {
                    spring: { month: 3 },
                    fall: { month: 9 }
                }
            };
        } catch (e) {
            console.error('getAppSettings error:', e);
            return {
                defaultSpreadWidth: 50,
                rateUnits: 'gal/ac',
                seasonBoundaries: { spring: { month: 3 }, fall: { month: 9 } }
            };
        }
    },

    async updateAppSettings(settings) {
        try {
            await setDoc(doc(db, "config", "settings"), {
                ...settings,
                updatedAt: new Date().toISOString(),
                updatedBy: FirebaseAuth.getCurrentUser()?.uid || null
            }, { merge: true });
            await this.logActivity('settings_update', { settings });
        } catch (e) {
            console.error('updateAppSettings error:', e);
            throw e;
        }
    }
};

// Farm functions
const FirebaseFarm = {
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    async createFarm(name, createdBy) {
        const farmId = this.generateId();
        await setDoc(doc(db, "farms", farmId), {
            id: farmId,
            name: name,
            createdBy: createdBy,
            createdAt: new Date().toISOString()
        });
        // Link user to farm
        await setDoc(doc(db, "users", createdBy), { farmId: farmId }, { merge: true });
        return farmId;
    },

    async getFarm(farmId) {
        try {
            const snap = await getDoc(doc(db, "farms", farmId));
            return snap.exists() ? snap.data() : null;
        } catch (e) {
            console.error('getFarm error:', e);
            return null;
        }
    },

    async getFarmByUser(userId) {
        try {
            const userSnap = await getDoc(doc(db, "users", userId));
            if (!userSnap.exists()) return null;
            const farmId = userSnap.data().farmId;
            if (!farmId) return null;
            return this.getFarm(farmId);
        } catch (e) {
            console.error('getFarmByUser error:', e);
            return null;
        }
    },

    async updateFarmName(farmId, name) {
        await setDoc(doc(db, "farms", farmId), { name }, { merge: true });
    },

    // Members
    async addMember(farmId, memberData) {
        await setDoc(doc(db, "farms", farmId, "members", memberData.userId), {
            ...memberData,
            joinedAt: new Date().toISOString()
        });
    },

    async getMembers(farmId) {
        try {
            const snapshot = await getDocs(collection(db, "farms", farmId, "members"));
            const members = [];
            snapshot.forEach(d => members.push(d.data()));
            return members;
        } catch (e) {
            console.error('getMembers error:', e);
            return [];
        }
    },

    async removeMember(farmId, userId) {
        await deleteDoc(doc(db, "farms", farmId, "members", userId));
    },

    // Farm Fields
    // IMPORTANT: GeoJSON stored as JSON string to avoid Firestore nested array limitation.
    // Read side (getFarmFields) parses geojsonStr back to object.
    async saveFarmField(farmId, fieldData) {
        const fieldId = this.generateId();
        const toStore = { ...fieldData };
        if (toStore.geojson) {
            toStore.geojsonStr = JSON.stringify(toStore.geojson);
            delete toStore.geojson;
        }
        const data = {
            id: fieldId,
            ...toStore,
            uploadedAt: new Date().toISOString()
        };
        await setDoc(doc(db, "farms", farmId, "fields", fieldId), data);
        data.geojson = fieldData.geojson;
        return data;
    },

    async getFarmFields(farmId) {
        try {
            const snapshot = await getDocs(collection(db, "farms", farmId, "fields"));
            const fields = [];
            snapshot.forEach(d => {
                const data = d.data();
                if (data.geojsonStr && !data.geojson) {
                    data.geojson = JSON.parse(data.geojsonStr);
                }
                fields.push(data);
            });
            return fields;
        } catch (e) {
            console.error('getFarmFields error:', e);
            return [];
        }
    },

    async deleteFarmField(farmId, fieldId) {
        await deleteDoc(doc(db, "farms", farmId, "fields", fieldId));
    },

    async updateFarmField(farmId, fieldId, fieldData) {
        const toStore = { ...fieldData };
        if (toStore.geojson) {
            toStore.geojsonStr = JSON.stringify(toStore.geojson);
            delete toStore.geojson;
        }
        await setDoc(doc(db, "farms", farmId, "fields", fieldId), {
            id: fieldId,
            ...toStore,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    },

    // Equipment
    async saveEquipment(farmId, equipData) {
        const equipId = this.generateId();
        const data = {
            id: equipId,
            ...equipData,
            createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, "farms", farmId, "equipment", equipId), data);
        return data;
    },

    async getEquipment(farmId) {
        try {
            const snapshot = await getDocs(collection(db, "farms", farmId, "equipment"));
            const items = [];
            snapshot.forEach(d => items.push(d.data()));
            return items;
        } catch (e) {
            console.error('getEquipment error:', e);
            return [];
        }
    },

    async deleteEquipment(farmId, equipId) {
        await deleteDoc(doc(db, "farms", farmId, "equipment", equipId));
    },

    async updateEquipment(farmId, equipId, data) {
        await setDoc(doc(db, "farms", farmId, "equipment", equipId), {
            id: equipId,
            ...data,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    },

    // Storages
    async saveStorage(farmId, storageData) {
        const storageId = this.generateId();
        const data = {
            id: storageId,
            ...storageData,
            createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, "farms", farmId, "storages", storageId), data);
        return data;
    },

    async getStorages(farmId) {
        try {
            const snapshot = await getDocs(collection(db, "farms", farmId, "storages"));
            const items = [];
            snapshot.forEach(d => items.push(d.data()));
            return items;
        } catch (e) {
            console.error('getStorages error:', e);
            return [];
        }
    },

    async deleteStorage(farmId, storageId) {
        await deleteDoc(doc(db, "farms", farmId, "storages", storageId));
    },

    async updateStorage(farmId, storageId, data) {
        await setDoc(doc(db, "farms", farmId, "storages", storageId), {
            id: storageId,
            ...data,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    },

    // Invites
    async createInvite(inviteData) {
        const inviteId = this.generateId();
        await setDoc(doc(db, "invites", inviteId), {
            id: inviteId,
            ...inviteData
        });
        return inviteId;
    },

    async getInvitesForEmail(email) {
        try {
            const q = query(collection(db, "invites"), where("invitedEmail", "==", email), where("status", "==", "pending"));
            const snapshot = await getDocs(q);
            const invites = [];
            snapshot.forEach(d => invites.push(d.data()));
            return invites;
        } catch (e) {
            console.error('getInvitesForEmail error:', e);
            return [];
        }
    },

    async acceptInvite(inviteId, user) {
        // Update invite status
        await setDoc(doc(db, "invites", inviteId), { status: 'accepted' }, { merge: true });

        // Get invite data
        const snap = await getDoc(doc(db, "invites", inviteId));
        if (!snap.exists()) return;
        const invite = snap.data();

        // Link user to farm
        await setDoc(doc(db, "users", user.uid), { farmId: invite.farmId }, { merge: true });

        // Add as member
        await this.addMember(invite.farmId, {
            userId: user.uid,
            email: user.email,
            name: user.name || '',
            role: invite.role
        });
    }
};

// Export for use in other modules
window.FirebaseAuth = FirebaseAuth;
window.FirebaseDB = FirebaseDB;
window.FirebaseAdmin = FirebaseAdmin;
window.FirebaseFarm = FirebaseFarm;

// Initialize auth listener
FirebaseAuth.init(async (user) => {
    console.log('Auth state changed:', user ? user.email : 'logged out');

    // Ensure existing users have role/features fields, and auto-assign superadmin
    if (user) {
        try {
            const userDocRef = doc(db, "users", user.uid);
            const snap = await getDoc(userDocRef);
            if (snap.exists()) {
                const data = snap.data();
                const updates = {};
                if (!data.role) {
                    updates.role = user.email.toLowerCase() === 'erics@teamaginc.com' ? 'superadmin' : 'farmer';
                }
                if (!data.features) {
                    updates.features = { fieldShapefiles: false };
                }
                if (Object.keys(updates).length > 0) {
                    await setDoc(userDocRef, updates, { merge: true });
                    console.log('Backfilled user doc fields:', updates);
                }
            } else {
                // No user doc at all — create one
                const role = user.email.toLowerCase() === 'erics@teamaginc.com' ? 'superadmin' : 'farmer';
                await setDoc(userDocRef, {
                    email: user.email,
                    name: user.displayName || '',
                    role: role,
                    features: { fieldShapefiles: false },
                    createdAt: new Date().toISOString()
                });
                console.log('Created missing user doc with role:', role);
            }
        } catch (e) {
            console.error('Error backfilling user doc:', e);
        }
    }

    // Dispatch custom event for app.js to handle
    window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user } }));
});

export { FirebaseAuth, FirebaseDB, FirebaseAdmin, FirebaseFarm };
