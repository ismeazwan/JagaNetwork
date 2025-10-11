// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, 
    collection, query, where, getDocs, writeBatch, serverTimestamp, deleteField, orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Konfigurasi Firebase Anda
const firebaseConfig = {
    apiKey: "AIzaSyBeuxfhsPRqd3NJTp0zUfnuZGJEKLBh3g0",
    authDomain: "database-jaganetwork.firebaseapp.com",
    projectId: "database-jaganetwork",
    storageBucket: "database-jaganetwork.appspot.com",
    messagingSenderId: "912989992875",
    appId: "1:912989992875:web:8c6cda77171889e1e644ee"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Data Global (diakses oleh modul halaman)
window.allCustomers = [];
window.allPackages = [];
window.allInvoices = [];
window.allExpenses = [];
window.allNetworkStatus = [];
window.allBlogPosts = [];

// Elemen Global
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const mainContent = document.getElementById('main-content');

// --- Path & Referensi Firestore ---
const dataContainerPath = "jaganetwork_data/shared_workspace";
const getCollectionRef = (name) => collection(db, dataContainerPath, name);

// --- Manajemen Data & Listener ---
let unsubscribers = [];

function startAllListeners() {
    if (unsubscribers.length > 0) return;

    const collectionsToListen = [
        { name: 'customers', globalVar: 'allCustomers' },
        { name: 'packages', globalVar: 'allPackages' },
        { name: 'invoices', globalVar: 'allInvoices' },
        { name: 'expenses', globalVar: 'allExpenses' },
    ];

    collectionsToListen.forEach(c => {
        const q = query(getCollectionRef(c.name));
        const unsub = onSnapshot(q, (snapshot) => {
            window[c.globalVar] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Kirim event kustom untuk memberitahu halaman aktif bahwa data telah berubah
            window.dispatchEvent(new CustomEvent('dataChanged', { detail: { collection: c.name } }));
        }, (error) => {
            console.error(`Error listening to ${c.name}:`, error);
        });
        unsubscribers.push(unsub);
    });
}

function stopAllListeners() {
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];
}

// --- FUNGSI CRUD GLOBAL (Dipanggil dari modul halaman) ---
window.generateUniqueCustomerId = function() {
    let newId;
    let isUnique = false;
    while (!isUnique) {
        newId = String(Math.floor(10000 + Math.random() * 90000));
        if (!window.allCustomers.some(c => c.customerId === newId)) {
            isUnique = true;
        }
    }
    return newId;
}

window.saveCustomer = async function(data) {
    try {
        const customerData = { 
            customerId: data.customerId, 
            nama: data.nama, 
            alamat: data.alamat, 
            hp: data.hp, 
            paketId: data.paketId, 
            joinDate: data.joinDate
        };
        if (data.id) {
            await setDoc(doc(db, dataContainerPath, 'customers', data.id), customerData, { merge: true });
            window.showToast("Data pelanggan berhasil diperbarui.");
        } else {
            await addDoc(getCollectionRef('customers'), customerData);
            window.showToast("Pelanggan baru berhasil ditambahkan.");
        }
    } catch (error) { 
        console.error("Error saving customer:", error); 
        window.showToast("Gagal menyimpan data.", "error"); 
    }
}

window.deleteCustomer = async function(id) {
    const q = query(getCollectionRef('invoices'), where("pelangganId", "==", id));
    const invoiceDocs = await getDocs(q);
    if (!invoiceDocs.empty) {
        return window.showToast("Pelanggan tidak bisa dihapus karena memiliki tagihan.", "error");
    }
    try {
        await deleteDoc(doc(db, dataContainerPath, 'customers', id));
        window.showToast("Data pelanggan berhasil dihapus.");
    } catch (e) { 
        console.error("Error deleting customer:", e); 
        window.showToast("Gagal menghapus data.", "error"); 
    }
}


// --- Logika Navigasi dan Pemuatan Konten ---
async function loadContent(page) {
    try {
        const response = await fetch(`${page}.html`);
        if (!response.ok) {
            mainContent.innerHTML = `<p class="text-center text-red-500">Gagal memuat halaman: ${page}.html</p>`;
            return;
        }
        mainContent.innerHTML = await response.text();
        
        // Cari dan jalankan skrip modul dari konten yang dimuat
        const scriptElement = mainContent.querySelector('script[type="module"]');
        if (scriptElement) {
            const dynamicScript = document.createElement('script');
            dynamicScript.type = 'module';
            dynamicScript.textContent = scriptElement.textContent; // Gunakan textContent
            scriptElement.remove(); // Hapus skrip asli agar tidak dieksekusi browser secara otomatis
            mainContent.appendChild(dynamicScript);
        }
        lucide.createIcons();

    } catch (error) {
        console.error('Error loading content:', error);
        mainContent.innerHTML = `<p class="text-center text-red-500">Terjadi kesalahan saat memuat konten.</p>`;
    }
}

function handleNavigation() {
    const hash = window.location.hash.substring(1) || 'dashboard';
    loadContent(hash);
    
    document.querySelectorAll('.tab-item').forEach(el => {
        el.classList.toggle('tab-active', el.getAttribute('href') === `#${hash}`);
    });
}

// --- Manajemen Autentikasi ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        showApp(user);
    } else {
        showAuth();
    }
});

function showApp(user) {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    appContainer.classList.add('flex');
    document.body.classList.remove('no-scroll');
    document.getElementById('user-email').textContent = user.email;
    
    startAllListeners();
    handleNavigation();
    window.addEventListener('hashchange', handleNavigation);
    setupAppListeners();
}

function showAuth() {
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    appContainer.classList.remove('flex');
    document.body.classList.add('no-scroll');
    window.removeEventListener('hashchange', handleNavigation);
    stopAllListeners();
}

// --- Listener Global Aplikasi ---
let appListenersAttached = false;
function setupAppListeners() {
    if(appListenersAttached) return;

    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        backdrop.classList.toggle('hidden');
    });
    backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop.classList.add('hidden');
    });
    
    // Menutup sidebar mobile setelah item menu diklik
    document.querySelectorAll('.tab-item').forEach(item => {
        item.addEventListener('click', () => {
            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                backdrop.classList.add('hidden');
            }
        });
    });

    appListenersAttached = true;
}

// --- Listener Autentikasi ---
function setupAuthListeners() {
    let isLoginMode = true;
    const toggleAuthMode = document.getElementById('toggle-auth-mode');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authTitle = document.getElementById('auth-title');
    const authError = document.getElementById('auth-error');

    toggleAuthMode.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        authError.textContent = '';
        loginForm.classList.toggle('hidden', !isLoginMode);
        registerForm.classList.toggle('hidden', isLoginMode);
        authTitle.textContent = isLoginMode ? 'Login ke Akun Anda' : 'Buat Akun Baru';
        toggleAuthMode.textContent = isLoginMode ? 'Belum punya akun? Daftar sekarang' : 'Sudah punya akun? Login';
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, pass).catch(err => {
            authError.textContent = "Email atau password salah.";
        });
    });

    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const pass = document.getElementById('register-password').value;
        createUserWithEmailAndPassword(auth, email, pass).catch(err => {
            let msg = "Terjadi kesalahan.";
            if (err.code === 'auth/email-already-in-use') msg = "Email ini sudah terdaftar.";
            else if (err.code === 'auth/weak-password') msg = "Password minimal 6 karakter.";
            else if (err.code === 'auth/invalid-email') msg = "Format email tidak valid.";
            authError.textContent = msg;
        });
    });
}

// --- Fungsi Utilitas Global ---
window.showToast = function(message, type = 'success') {
    const toast = document.getElementById('toast');
    if(!toast) return;
    const msg = document.getElementById('toast-message');
    toast.className = 'fixed bottom-5 right-5 text-white py-3 px-6 rounded-lg shadow-lg transform transition-all duration-300 z-50';
    const typeClasses = { error: 'bg-red-600', info: 'bg-blue-600' };
    toast.classList.add(typeClasses[type] || 'bg-gray-800');
    msg.textContent = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

window.formatRupiah = (angka) => !angka && angka !== 0 ? 'Rp 0' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
window.formatPhoneNumber = (phone) => {
    if (!phone) return null;
    let formatted = phone.replace(/[^0-9]/g, '');
    if (formatted.startsWith('0')) {
        formatted = '62' + formatted.substring(1);
    } else if (formatted.startsWith('+62')) {
        formatted = formatted.substring(1);
    }
    return formatted;
};

// Inisialisasi
setupAuthListeners();
lucide.createIcons();

