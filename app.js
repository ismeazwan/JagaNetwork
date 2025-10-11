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
        { name: 'network_status', globalVar: 'allNetworkStatus' },
        { name: 'articles', globalVar: 'allBlogPosts' }
    ];

    collectionsToListen.forEach(c => {
        const q = query(getCollectionRef(c.name));
        const unsub = onSnapshot(q, (snapshot) => {
            window[c.globalVar] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

// --- FUNGSI CRUD GLOBAL ---
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
            customerId: data.customerId, nama: data.nama, alamat: data.alamat, hp: data.hp, 
            paketId: data.paketId, joinDate: data.joinDate
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
    if (!(await getDocs(q)).empty) return window.showToast("Pelanggan tidak bisa dihapus karena memiliki tagihan.", "error");
    try {
        await deleteDoc(doc(db, dataContainerPath, 'customers', id));
        window.showToast("Data pelanggan berhasil dihapus.");
    } catch (e) { 
        console.error("Error deleting customer:", e); 
        window.showToast("Gagal menghapus data.", "error"); 
    }
}

window.savePackage = async function(data) {
    try {
        const pkgData = { 
            nama: data.nama, kecepatan: data.kecepatan, harga: Number(data.harga), 
            hargaProrate: Number(data.hargaProrate) || 0
        };
        if (data.id) {
            await setDoc(doc(db, dataContainerPath, 'packages', data.id), pkgData);
            window.showToast("Data paket berhasil diperbarui.");
        } else {
            await addDoc(getCollectionRef('packages'), pkgData);
            window.showToast("Paket baru berhasil ditambahkan.");
        }
    } catch (error) { 
        console.error("Error saving package:", error); 
        window.showToast("Gagal menyimpan data.", "error"); 
    }
}

window.deletePackage = async function(id) {
    if (window.allCustomers.some(c => c.paketId === id)) {
        return window.showToast("Paket tidak bisa dihapus, masih digunakan pelanggan.", "error");
    }
    try {
        await deleteDoc(doc(db, dataContainerPath, 'packages', id));
        window.showToast("Data paket berhasil dihapus.");
    } catch (e) { 
        console.error("Error deleting package:", e); 
        window.showToast("Gagal menghapus data.", "error"); 
    }
}

window.saveInvoice = async function(data) {
    try {
        const invoiceData = {
            jumlah: Number(data.jumlah),
            periode: data.periode,
        };
        await updateDoc(doc(db, dataContainerPath, 'invoices', data.id), invoiceData);
        window.showToast("Tagihan berhasil diperbarui.");
    } catch (error) { 
        console.error("Error saving invoice:", error); 
        window.showToast("Gagal memperbarui tagihan.", "error"); 
    }
}

window.deleteInvoice = async function(id) {
    try {
        await deleteDoc(doc(db, dataContainerPath, 'invoices', id));
        window.showToast("Tagihan berhasil dihapus.");
    } catch (e) { 
        console.error("Error deleting invoice:", e); 
        window.showToast("Gagal menghapus tagihan.", "error"); 
    }
}

window.updateInvoiceStatus = async function(id, newStatus, clearProof = false) {
    try {
        const dataToUpdate = { status: newStatus };
        if (clearProof) {
            dataToUpdate.proofOfPaymentURL = deleteField();
        }
        await updateDoc(doc(db, dataContainerPath, 'invoices', id), dataToUpdate);
        window.showToast("Status tagihan berhasil diperbarui.");
    } catch(e) { 
        console.error("Error updating invoice:", e); 
        window.showToast("Gagal memperbarui status tagihan.", "error"); 
    }
}

window.generateInvoices = async function(year, month) {
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    if (!confirm(`Generate tagihan untuk periode ${monthNames[month]} ${year}?\nPastikan Anda belum men-generate tagihan untuk periode ini.`)) return;
    
    window.showToast(`Membuat tagihan untuk ${monthNames[month]} ${year}...`, "info");
    const batch = writeBatch(db);
    let generatedCount = 0, skippedCount = 0;
    const nextPeriodEndDate = new Date(year, month + 1, 7);
    const nextPeriodString = nextPeriodEndDate.toISOString().split('T')[0];

    for (const customer of window.allCustomers) {
        const pkg = window.allPackages.find(p => p.id === customer.paketId);
        if (!pkg) { skippedCount++; continue; }

        const alreadyExists = window.allInvoices.some(inv => inv.pelangganId === customer.id && inv.periode === nextPeriodString);
        if (!alreadyExists) {
            batch.set(doc(getCollectionRef('invoices')), {
                pelangganId: customer.id, jumlah: pkg.harga, periode: nextPeriodString,
                status: 'belum lunas', createdAt: serverTimestamp(), isProrated: false
            });
            generatedCount++;
        } else {
            skippedCount++;
        }
    }
    if (generatedCount > 0) await batch.commit();
    window.showToast(generatedCount > 0 ? `${generatedCount} tagihan bulanan baru digenerate.` : "Tidak ada tagihan baru.");
    if (skippedCount > 0) window.showToast(`${skippedCount} pelanggan dilewati (tagihan sudah ada).`, 'info');
}

window.generateProrateInvoices = async function() {
    if (!confirm(`Generate tagihan prorata untuk SEMUA pelanggan baru?\nHanya untuk yang belum pernah ditagih.`)) return;
    
    window.showToast("Memeriksa pelanggan baru...", "info");
    const batch = writeBatch(db);
    let generatedCount = 0, skippedCount = 0;

    for (const customer of window.allCustomers) {
        if (!customer.joinDate || window.allInvoices.some(inv => inv.pelangganId === customer.id)) {
            skippedCount++; continue;
        }
        const pkg = window.allPackages.find(p => p.id === customer.paketId);
        if (!pkg) { skippedCount++; continue; }
        const joinDate = new Date(customer.joinDate + 'T00:00:00');
        const joinDay = joinDate.getDate();
        let endDateProrate = new Date(joinDate.getFullYear(), joinDate.getMonth() + (joinDay > 7 ? 1 : 0), 7);
        const daysOfService = Math.round((endDateProrate - joinDate) / (1000 * 60 * 60 * 24)) + 1;
        if (daysOfService <= 0) { skippedCount++; continue; }
        const dailyProratePrice = pkg.hargaProrate > 0 ? pkg.hargaProrate : (pkg.harga / 30);
        const proratedAmount = Math.round(dailyProratePrice * daysOfService);
        batch.set(doc(getCollectionRef('invoices')), {
            pelangganId: customer.id, jumlah: proratedAmount, periode: endDateProrate.toISOString().split('T')[0],
            status: 'belum lunas', createdAt: serverTimestamp(), isProrated: true
        });
        generatedCount++;
    }
    if (generatedCount > 0) await batch.commit();
    window.showToast(generatedCount > 0 ? `${generatedCount} tagihan prorata berhasil digenerate.` : "Tidak ada pelanggan baru.");
    if(skippedCount > 0) window.showToast(`${skippedCount} pelanggan dilewati (sudah punya tagihan).`, 'info');
}

window.saveExpense = async function(data) {
    try {
        const expenseData = {
            tanggal: data.tanggal,
            kategori: data.kategori,
            deskripsi: data.deskripsi,
            jumlah: Number(data.jumlah),
            createdAt: serverTimestamp()
        };
        if (data.id) {
            delete expenseData.createdAt;
            await setDoc(doc(db, dataContainerPath, 'expenses', data.id), expenseData, { merge: true });
            window.showToast("Data pengeluaran berhasil diperbarui.");
        } else {
            await addDoc(getCollectionRef('expenses'), expenseData);
            window.showToast("Pengeluaran baru berhasil ditambahkan.");
        }
    } catch (error) {
        console.error("Error saving expense:", error);
        window.showToast("Gagal menyimpan data pengeluaran.", "error");
    }
}

window.deleteExpense = async function(id) {
    try {
        await deleteDoc(doc(db, dataContainerPath, 'expenses', id));
        window.showToast("Data pengeluaran berhasil dihapus.");
    } catch (e) {
        console.error("Error deleting expense:", e);
        window.showToast("Gagal menghapus data.", "error");
    }
}

window.saveNetworkStatus = async function(data) {
     try {
        const statusData = { 
            title: data.title, 
            description: data.description, 
            status: data.status,
            timestamp: serverTimestamp()
        };
        if (data.id) {
            const originalStatus = window.allNetworkStatus.find(s => s.id === data.id);
            statusData.timestamp = originalStatus.timestamp || serverTimestamp();
            await setDoc(doc(db, dataContainerPath, 'network_status', data.id), statusData, { merge: true });
            window.showToast("Status jaringan berhasil diperbarui.");
        } else {
            await addDoc(getCollectionRef('network_status'), statusData);
            window.showToast("Status jaringan baru berhasil dipublikasikan.");
        }
    } catch (error) { 
        console.error("Error saving network status:", error); 
        window.showToast("Gagal menyimpan data status.", "error"); 
    }
}

window.deleteNetworkStatus = async function(id) {
    try {
        await deleteDoc(doc(db, dataContainerPath, 'network_status', id));
        window.showToast("Data status berhasil dihapus.");
    } catch (e) { console.error("Error deleting status:", e); window.showToast("Gagal menghapus data.", "error"); }
}

window.saveBlogPost = async function(data) {
    try {
        const postData = {
            title: data.title,
            category: data.category,
            imageUrl: data.imageUrl,
            content: data.content,
            createdAt: serverTimestamp()
        };
        if (data.id) {
            const originalPost = window.allBlogPosts.find(p => p.id === data.id);
            postData.createdAt = originalPost.createdAt || serverTimestamp();
            await setDoc(doc(db, dataContainerPath, 'articles', data.id), postData, { merge: true });
            window.showToast("Artikel berhasil diperbarui.");
        } else {
            await addDoc(getCollectionRef('articles'), postData);
            window.showToast("Artikel baru berhasil dipublikasikan.");
        }
    } catch (error) {
        console.error("Error saving blog post:", error);
        window.showToast("Gagal menyimpan artikel.", "error");
    }
}

window.deleteBlogPost = async function(id) {
    try {
        await deleteDoc(doc(db, dataContainerPath, 'articles', id));
        window.showToast("Artikel berhasil dihapus.");
    } catch (e) { console.error("Error deleting post:", e); window.showToast("Gagal menghapus artikel.", "error"); }
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
        
        const scriptElement = mainContent.querySelector('script[type="module"]');
        if (scriptElement) {
            const dynamicScript = document.createElement('script');
            dynamicScript.type = 'module';
            dynamicScript.textContent = scriptElement.textContent;
            scriptElement.remove();
            mainContent.appendChild(dynamicScript);
        }
        lucide.createIcons();
    } catch (error) {
        console.error('Error loading content:', error);
        mainContent.innerHTML = `<p class="text-center text-red-500">Terjadi kesalahan.</p>`;
    }
}

async function handleNavigation() {
    const hash = window.location.hash.substring(1) || 'dashboard';
    await loadContent(hash);
    document.querySelectorAll('.tab-item').forEach(el => {
        el.classList.toggle('tab-active', el.getAttribute('href') === `#${hash}`);
    });
}

// --- Manajemen Autentikasi ---
onAuthStateChanged(auth, (user) => user ? showApp(user) : showAuth());

async function showApp(user) {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    appContainer.classList.add('flex');
    document.body.classList.remove('no-scroll');
    document.getElementById('user-email').textContent = user.email;
    
    // Memuat UI terlebih dahulu, dan TUNGGU sampai selesai
    await handleNavigation();
    window.addEventListener('hashchange', handleNavigation);
    setupAppListeners();
    // BARU mengambil data setelah UI siap
    startAllListeners();
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
window.getBillingPeriodText = function(invoice, customer) {
    const endDate = new Date(invoice.periode + 'T00:00:00');
    let startDate;
    if (invoice.isProrated && customer?.joinDate) {
        startDate = new Date(customer.joinDate + 'T00:00:00');
    } else {
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 8);
    }
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${startDate.toLocaleDateString('id-ID', options)} - ${endDate.toLocaleDateString('id-ID', options)}`;
}
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

