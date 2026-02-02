// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, orderBy, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

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
