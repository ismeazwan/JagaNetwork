import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, 
    collection, query, where, getDocs, writeBatch, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBeuxfhsPRqd3NJTp0zUfnuZGJEKLBh3g0",
    authDomain: "database-jaganetwork.firebaseapp.com",
    projectId: "database-jaganetwork",
    storageBucket: "database-jaganetwork.appspot.com",
    messagingSenderId: "912989992875",
    appId: "1:912989992875:web:8c6cda77171889e1e644ee"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let userIsLoggedIn = false;
let appListenersAttached = false;
let allCustomers = [], allPackages = [], allInvoices = [];
let unsubscribeCustomers, unsubscribePackages, unsubscribeInvoices;
let deleteCallback = null;
let verificationInvoiceId = null;
let chatContext = {};

let lineChartInstance, pieChartInstance;

const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');

const dataContainerPath = "jaganetwork_data/shared_workspace";
const getCollectionRef = (name) => collection(db, dataContainerPath, name);

function generateUniqueCustomerId() {
    let newId;
    let isUnique = false;
    while (!isUnique) {
        newId = String(Math.floor(10000 + Math.random() * 90000));
        if (!allCustomers.some(c => c.customerId === newId)) {
            isUnique = true;
        }
    }
    return newId;
}

function loadCustomers() {
    const q = query(getCollectionRef('customers'));
    if (unsubscribeCustomers) unsubscribeCustomers();
    unsubscribeCustomers = onSnapshot(q, (snapshot) => {
        allCustomers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCustomers(); 
        populatePelangganFilter();
        updateCharts();
    });
}
async function saveCustomer(data) {
    try {
        const customerData = { 
            customerId: data.customerId, nama: data.nama, alamat: data.alamat, hp: data.hp, 
            paketId: data.paketId, joinDate: data.joinDate
        };
        if (data.id) {
            await setDoc(doc(db, dataContainerPath, 'customers', data.id), customerData, { merge: true });
            showToast("Data pelanggan berhasil diperbarui.");
        } else {
            await addDoc(getCollectionRef('customers'), customerData);
            showToast("Pelanggan baru berhasil ditambahkan. Gunakan 'Generate Prorate' untuk tagihan pertama.");
        }
        closeModal(document.getElementById('modal-pelanggan'));
    } catch (error) { console.error("Error saving customer:", error); showToast("Gagal menyimpan data.", "error"); }
}
async function deleteCustomer(id) {
    const q = query(getCollectionRef('invoices'), where("pelangganId", "==", id));
    if (!(await getDocs(q)).empty) return showToast("Pelanggan tidak bisa dihapus karena memiliki tagihan.", "error");
    try {
        await deleteDoc(doc(db, dataContainerPath, 'customers', id));
        showToast("Data pelanggan berhasil dihapus.");
    } catch (e) { console.error("Error deleting customer:", e); showToast("Gagal menghapus data.", "error"); }
}

function loadPackages() {
    if (unsubscribePackages) unsubscribePackages();
    unsubscribePackages = onSnapshot(query(getCollectionRef('packages')), (snapshot) => {
        allPackages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderPackages();
        updateCharts();
    });
}
async function savePackage(data) {
    try {
        const pkgData = { 
            nama: data.nama, kecepatan: data.kecepatan, 
            harga: Number(data.harga), hargaProrate: Number(data.hargaProrate) || 0
        };
        if (data.id) {
            await setDoc(doc(db, dataContainerPath, 'packages', data.id), pkgData);
            showToast("Data paket berhasil diperbarui.");
        } else {
            await addDoc(getCollectionRef('packages'), pkgData);
            showToast("Paket baru berhasil ditambahkan.");
        }
        closeModal(document.getElementById('modal-paket'));
    } catch (error) { console.error("Error saving package:", error); showToast("Gagal menyimpan data.", "error"); }
}
async function deletePackage(id) {
    if (allCustomers.some(c => c.paketId === id)) return showToast("Paket tidak bisa dihapus, masih digunakan pelanggan.", "error");
    try {
        await deleteDoc(doc(db, dataContainerPath, 'packages', id));
        showToast("Data paket berhasil dihapus.");
    } catch (e) { console.error("Error deleting package:", e); showToast("Gagal menghapus data.", "error"); }
}

function loadInvoices() {
    if (unsubscribeInvoices) unsubscribeInvoices();
    unsubscribeInvoices = onSnapshot(query(getCollectionRef('invoices')), (snapshot) => {
        allInvoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInvoices(); renderLaporan(); updateDashboard(); updateCharts();
    });
}

async function saveInvoice(data) {
    try {
        const invoiceData = {
            jumlah: Number(data.jumlah),
            periode: data.periode,
        };
        await updateDoc(doc(db, dataContainerPath, 'invoices', data.id), invoiceData);
        showToast("Tagihan berhasil diperbarui.");
        closeModal(document.getElementById('modal-tagihan'));
    } catch (error) { console.error("Error saving invoice:", error); showToast("Gagal memperbarui tagihan.", "error"); }
}

async function deleteInvoice(id) {
    try {
        await deleteDoc(doc(db, dataContainerPath, 'invoices', id));
        showToast("Tagihan berhasil dihapus.");
    } catch (e) { console.error("Error deleting invoice:", e); showToast("Gagal menghapus tagihan.", "error"); }
}

function getBillingPeriodText(invoice, customer) {
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

async function generateInvoices() {
    const customerId = document.getElementById('pelanggan-filter').value;
    const targetCustomers = customerId === 'semua' ? allCustomers : allCustomers.filter(c => c.id === customerId);

    if (!targetCustomers.length) return showToast("Tidak ada pelanggan yang dipilih.", "error");
    if (!confirm(`Generate tagihan bulanan untuk ${targetCustomers.length} pelanggan?\nIni untuk pembayaran periode berikutnya.`)) return;
    
    showToast("Memeriksa dan membuat tagihan bulanan...", "info");
    const batch = writeBatch(db);
    let generatedCount = 0, skippedCount = 0;

    for (const customer of targetCustomers) {
        const pkg = allPackages.find(p => p.id === customer.paketId);
        if (!pkg) { 
            skippedCount++; 
            continue; 
        }

        const lastInvoice = allInvoices.filter(inv => inv.pelangganId === customer.id)
            .sort((a, b) => new Date(b.periode) - new Date(a.periode))[0];
        
        let nextPeriodEndDate;

        if (lastInvoice) {
            const lastPeriodEndDate = new Date(lastInvoice.periode);
            nextPeriodEndDate = new Date(lastPeriodEndDate.getFullYear(), lastPeriodEndDate.getMonth() + 1, 7);
        } else {
            if (!customer.joinDate) {
                skippedCount++;
                continue;
            }
            const joinDate = new Date(customer.joinDate + 'T00:00:00');
            
            let joinCycleEnd = new Date(joinDate.getFullYear(), joinDate.getMonth(), 7);
            if (joinDate.getDate() > 7) {
                joinCycleEnd = new Date(joinDate.getFullYear(), joinDate.getMonth() + 1, 7);
            }

            nextPeriodEndDate = new Date(joinCycleEnd.getFullYear(), joinCycleEnd.getMonth() + 1, 7);
        }

        const nextPeriodString = nextPeriodEndDate.toISOString().split('T')[0];
        
        const alreadyExists = allInvoices.some(inv => inv.pelangganId === customer.id && inv.periode === nextPeriodString);

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
    showToast(generatedCount > 0 ? `${generatedCount} tagihan bulanan baru digenerate.` : "Tidak ada tagihan baru untuk digenerate.");
    if (skippedCount > 0) showToast(`${skippedCount} pelanggan dilewati (tagihan sudah ada atau data tidak lengkap).`, 'info');
}

async function generateProrateInvoices() {
    const customerId = document.getElementById('pelanggan-filter').value;
    const targetCustomers = customerId === 'semua' ? allCustomers : allCustomers.filter(c => c.id === customerId);

    if (!targetCustomers.length) return showToast("Tidak ada pelanggan yang dipilih.", "error");
    if (!confirm(`Generate tagihan prorata untuk ${targetCustomers.length} pelanggan?\nHanya untuk yang belum pernah ditagih.`)) return;
    
    showToast("Memeriksa pelanggan baru...", "info");
    const batch = writeBatch(db);
    let generatedCount = 0, skippedCount = 0;

    for (const customer of targetCustomers) {
        if (!customer.joinDate || allInvoices.some(inv => inv.pelangganId === customer.id)) {
            skippedCount++; continue;
        }

        const pkg = allPackages.find(p => p.id === customer.paketId);
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
    showToast(generatedCount > 0 ? `${generatedCount} tagihan prorata berhasil digenerate.` : "Tidak ada pelanggan baru untuk ditagih.");
    if(skippedCount > 0) showToast(`${skippedCount} pelanggan dilewati (sudah memiliki tagihan).`, 'info');
}

async function updateInvoiceStatus(id, newStatus, clearProof = false) {
    try {
        const dataToUpdate = { status: newStatus };
        if (clearProof) {
            dataToUpdate.proofOfPaymentURL = deleteField();
        }
        await updateDoc(doc(db, dataContainerPath, 'invoices', id), dataToUpdate);
        showToast("Status tagihan berhasil diperbarui.");
    } catch(e) { console.error("Error updating invoice:", e); showToast("Gagal memperbarui status tagihan.", "error"); }
}

onAuthStateChanged(auth, (user) => user ? showApp(user) : showAuth());
function showApp(user) {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    appContainer.classList.add('flex');
    document.getElementById('user-email').textContent = user.email;
    if (!userIsLoggedIn) { userIsLoggedIn = true; initApp(); }
}
function showAuth() {
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    appContainer.classList.remove('flex');
    userIsLoggedIn = false; appListenersAttached = false;
    if (unsubscribeCustomers) unsubscribeCustomers();
    if (unsubscribePackages) unsubscribePackages();
    if (unsubscribeInvoices) unsubscribeInvoices();
}

function initApp() { 
    setupAppListeners(); 
    loadData(); 
    renderCharts();
    populateLaporanDateFilters(); 
    switchTab('dashboard'); 
}
function loadData() { loadCustomers(); loadPackages(); loadInvoices(); }

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('tab-active'));
    document.getElementById(`content-${tabId}`).classList.remove('hidden');
    document.getElementById(`tab-${tabId}`).classList.add('tab-active');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        backdrop.classList.add('hidden');
    }
}
function openModal(modal) { modal.style.display = 'flex'; }
function closeModal(modal) { modal.style.display = 'none'; }
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast'), msg = document.getElementById('toast-message');
    toast.className = 'fixed bottom-5 right-5 text-white py-3 px-6 rounded-lg shadow-lg transform transition-all duration-300 z-50';
    const typeClasses = { error: 'bg-red-600', info: 'bg-blue-600' };
    toast.classList.add(typeClasses[type] || 'bg-gray-800');
    msg.textContent = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}
const formatRupiah = (angka) => !angka ? '-' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);

const formatPhoneNumber = (phone) => {
    if (!phone) return null;
    let formatted = phone.replace(/[^0-9]/g, '');
    if (formatted.startsWith('0')) {
        formatted = '62' + formatted.substring(1);
    } else if (formatted.startsWith('+62')) {
        formatted = formatted.substring(1);
    }
    return formatted;
};

function renderCustomers() {
    const tbody = document.getElementById('pelanggan-table-body');
    tbody.innerHTML = !allCustomers.length ? `<tr><td colspan="6" class="p-8 text-center text-gray-500">Belum ada pelanggan.</td></tr>` : 
        allCustomers.sort((a,b) => a.nama.localeCompare(b.nama)).map(c => {
            const pkg = allPackages.find(p => p.id === c.paketId) || { nama: 'N/A' };
            return `<tr class="border-b hover:bg-gray-50">
                        <td class="p-4 font-mono text-sm text-gray-600">${c.customerId || '-'}</td>
                        <td class="p-4">${c.nama}</td><td class="p-4">${c.alamat}</td><td class="p-4">${c.hp}</td>
                        <td class="p-4">${pkg.nama}</td>
                        <td class="p-4 flex gap-3">
                            <button class="btn-chat text-green-600 hover:text-green-800" data-customer-id="${c.id}" title="Kirim WhatsApp"><i data-lucide="message-circle" class="w-5 h-5"></i></button>
                            <button class="btn-edit-pelanggan text-blue-600 hover:text-blue-800" data-id="${c.id}" title="Edit"><i data-lucide="edit" class="w-5 h-5"></i></button>
                            <button class="btn-delete-pelanggan text-red-600 hover:text-red-800" data-id="${c.id}" title="Hapus"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                        </td></tr>`;
        }).join('');
    lucide.createIcons();
}
function renderPackages() {
    const tbody = document.getElementById('paket-table-body');
    tbody.innerHTML = !allPackages.length ? `<tr><td colspan="5" class="p-8 text-center text-gray-500">Belum ada paket.</td></tr>` : 
        allPackages.map(p => `<tr class="border-b hover:bg-gray-50">
                    <td class="p-4">${p.nama}</td><td class="p-4">${p.kecepatan}</td>
                    <td class="p-4">${formatRupiah(p.harga)}</td><td class="p-4">${formatRupiah(p.hargaProrate)}</td>
                    <td class="p-4 flex gap-2">
                        <button class="btn-edit-paket text-blue-600 hover:text-blue-800" data-id="${p.id}"><i data-lucide="edit" class="w-5 h-5"></i></button>
                        <button class="btn-delete-paket text-red-600 hover:text-red-800" data-id="${p.id}"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                    </td></tr>`).join('');
    lucide.createIcons();
}
function renderInvoices() {
    const tbody = document.getElementById('tagihan-table-body');
    if (!allInvoices.length) { tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">Belum ada tagihan.</td></tr>`; return; }
    tbody.innerHTML = [...allInvoices].sort((a,b) => b.periode.localeCompare(a.periode))
        .map(inv => {
            const customer = allCustomers.find(c => c.id === inv.pelangganId) || { nama: 'Terhapus' };
            
            let statusClass, statusText, actionBtn = '', editDeleteBtns = '', chatBtn = '';

            chatBtn = `<button class="btn-chat text-green-600 hover:text-green-800" data-customer-id="${customer.id}" title="Kirim WhatsApp"><i data-lucide="message-circle" class="w-5 h-5"></i></button>`;

            switch(inv.status) {
                case 'lunas':
                    statusClass = 'bg-green-100 text-green-800';
                    statusText = 'Lunas';
                    actionBtn = `<span class="text-sm text-gray-500">Lunas</span>`;
                    break;
                case 'menunggu konfirmasi':
                    statusClass = 'bg-yellow-100 text-yellow-800';
                    statusText = 'Menunggu Konfirmasi';
                    actionBtn = `<button class="btn-verifikasi-pembayaran bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-xs sm:text-sm" data-id="${inv.id}">Verifikasi</button>`;
                    break;
                default: // belum lunas
                    statusClass = 'bg-red-100 text-red-800';
                    statusText = 'Belum Lunas';
                    actionBtn = `<button class="btn-bayar-tagihan bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 text-xs sm:text-sm" data-id="${inv.id}">Bayar</button>`;
                    editDeleteBtns = `
                        <button class="btn-edit-tagihan text-blue-600 hover:text-blue-800" data-id="${inv.id}"><i data-lucide="edit" class="w-5 h-5"></i></button>
                        <button class="btn-delete-tagihan text-red-600 hover:text-red-800" data-id="${inv.id}"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                    `;
                    break;
            }

            return `<tr class="border-b hover:bg-gray-50">
                        <td class="p-4">${customer.nama}</td><td class="p-4">${getBillingPeriodText(inv, customer)}</td>
                        <td class="p-4">${formatRupiah(inv.jumlah)} ${inv.isProrated ? '<span class="text-xs text-indigo-600">(Prorata)</span>' : ''}</td>
                        <td class="p-4"><span class="px-2 py-1 text-xs font-medium rounded-full ${statusClass}">${statusText}</span></td>
                        <td class="p-4 flex items-center gap-2 sm:gap-3">${actionBtn}${chatBtn}${editDeleteBtns}</td></tr>`;
        }).join('');
    lucide.createIcons();
}
function renderLaporan() {
    const bulan = document.getElementById('laporan-filter-bulan').value;
    const tahun = document.getElementById('laporan-filter-tahun').value;
    const filtered = allInvoices.filter(inv => { const p = new Date(inv.periode); return p.getMonth() == bulan && p.getFullYear() == tahun; });
    const lunas = filtered.filter(inv => inv.status === 'lunas');
    document.getElementById('laporan-total-pemasukan').textContent = formatRupiah(lunas.reduce((sum, inv) => sum + inv.jumlah, 0));
    document.getElementById('laporan-potensi-pemasukan').textContent = formatRupiah(filtered.reduce((sum, inv) => sum + inv.jumlah, 0));
    document.getElementById('laporan-transaksi-lunas').textContent = lunas.length;
    document.getElementById('laporan-tagihan-tertunggak').textContent = filtered.filter(inv => inv.status === 'belum lunas').length;
    const tbody = document.getElementById('laporan-table-body');
    tbody.innerHTML = !lunas.length ? `<tr><td colspan="3" class="p-8 text-center text-gray-500">Tidak ada transaksi lunas.</td></tr>` : 
        lunas.map(inv => {
            const c = allCustomers.find(c => c.id === inv.pelangganId) || { nama: 'Terhapus' };
            return `<tr class="border-b hover:bg-gray-50"><td class="p-4">${c.nama}</td><td class="p-4">${getBillingPeriodText(inv, c)}</td><td class="p-4">${formatRupiah(inv.jumlah)}</td></tr>`;
        }).join('');
}
function updateDashboard() {
    document.getElementById('total-pelanggan').textContent = allCustomers.length;
    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const monthlyInvoices = allInvoices.filter(inv => {
        const pDate = new Date(inv.periode);
        return pDate >= currentMonthStart && pDate <= currentMonthEnd;
    });
    const paidThisMonth = monthlyInvoices.filter(inv => inv.status === 'lunas');
    document.getElementById('total-pemasukan').textContent = formatRupiah(paidThisMonth.reduce((sum, inv) => sum + inv.jumlah, 0));
    document.getElementById('tagihan-lunas').textContent = paidThisMonth.length;
    document.getElementById('tagihan-belum-lunas').textContent = monthlyInvoices.filter(inv => inv.status === 'belum lunas').length;
}

function populatePelangganFilter() {
    const select = document.getElementById('pelanggan-filter');
    const currentVal = select.value;
    select.innerHTML = '<option value="semua">Semua Pelanggan</option>';
    allCustomers.sort((a,b) => a.nama.localeCompare(b.nama)).forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.nama}</option>`;
    });
    select.value = currentVal;
}
function populateLaporanDateFilters() {
    const bulan = document.getElementById('laporan-filter-bulan');
    const tahun = document.getElementById('laporan-filter-tahun');
    const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const currentYear = new Date().getFullYear(), currentMonth = new Date().getMonth();
    bulan.innerHTML = months.map((m, i) => `<option value="${i}" ${i === currentMonth ? 'selected' : ''}>${m}</option>`).join('');
    let yearOptions = '';
    for (let i = currentYear - 2; i <= currentYear + 1; i++) yearOptions += `<option value="${i}" ${i === currentYear ? 'selected' : ''}>${i}</option>`;
    tahun.innerHTML = yearOptions;
}

function renderCharts() {
    const lineCtx = document.getElementById('lineChart').getContext('2d');
    lineChartInstance = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Pendapatan', data: [],
                borderColor: 'rgb(79, 70, 229)', backgroundColor: 'rgba(79, 70, 229, 0.1)',
                tension: 0.1, yAxisID: 'y'
            }, {
                label: 'Pelanggan Baru', data: [],
                borderColor: 'rgb(22, 163, 74)', backgroundColor: 'rgba(22, 163, 74, 0.1)',
                tension: 0.1, yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Pendapatan (Rp)' } },
                y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Jumlah Pelanggan' }, grid: { drawOnChartArea: false } }
            }
        }
    });

    const pieCtx = document.getElementById('pieChart').getContext('2d');
    pieChartInstance = new Chart(pieCtx, {
        type: 'pie',
        data: { labels: [], datasets: [{ label: 'Pelanggan', data: [], backgroundColor: [] }] },
        options: { responsive: true }
    });
}

function updateCharts() {
    if (!lineChartInstance || !pieChartInstance || !allCustomers.length || !allPackages.length) return;

    const monthLabels = [];
    const revenueData = [];
    const newCustomerData = [];
    const today = new Date();

    for (let i = 11; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthName = date.toLocaleString('id-ID', { month: 'short' });
        const year = date.getFullYear();
        monthLabels.push(`${monthName} ${year}`);

        const monthRevenue = allInvoices
            .filter(inv => {
                const invDate = new Date(inv.periode);
                return inv.status === 'lunas' && invDate.getFullYear() === year && invDate.getMonth() === date.getMonth();
            })
            .reduce((sum, inv) => sum + inv.jumlah, 0);
        revenueData.push(monthRevenue);

        const newCustomers = allCustomers.filter(c => {
            if (!c.joinDate) return false;
            const joinDate = new Date(c.joinDate);
            return joinDate.getFullYear() === year && joinDate.getMonth() === date.getMonth();
        }).length;
        newCustomerData.push(newCustomers);
    }

    lineChartInstance.data.labels = monthLabels;
    lineChartInstance.data.datasets[0].data = revenueData;
    lineChartInstance.data.datasets[1].data = newCustomerData;
    lineChartInstance.update();

    const packageCounts = {};
    allCustomers.forEach(customer => {
        packageCounts[customer.paketId] = (packageCounts[customer.paketId] || 0) + 1;
    });

    const pieLabels = [];
    const pieData = [];
    const pieColors = [];
    for (const pkgId in packageCounts) {
        const pkg = allPackages.find(p => p.id === pkgId);
        if (pkg) {
            pieLabels.push(pkg.nama);
            pieData.push(packageCounts[pkgId]);
            pieColors.push(`hsl(${Math.random() * 360}, 70%, 50%)`);
        }
    }

    pieChartInstance.data.labels = pieLabels;
    pieChartInstance.data.datasets[0].data = pieData;
    pieChartInstance.data.datasets[0].backgroundColor = pieColors;
    pieChartInstance.update();
}

function setupAuthListeners() {
    let isLoginMode = true;
    document.getElementById('toggle-auth-mode').addEventListener('click', (e) => {
        e.preventDefault(); isLoginMode = !isLoginMode;
        document.getElementById('auth-error').textContent = '';
        document.getElementById('login-form').classList.toggle('hidden', !isLoginMode);
        document.getElementById('register-form').classList.toggle('hidden', isLoginMode);
        document.getElementById('auth-title').textContent = isLoginMode ? 'Login ke Akun Anda' : 'Buat Akun Baru';
        e.target.textContent = isLoginMode ? 'Belum punya akun? Daftar sekarang' : 'Sudah punya akun? Login';
    });
    document.getElementById('login-form').addEventListener('submit', (e) => { 
        e.preventDefault();
        const email = document.getElementById('login-email').value, pass = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, pass).catch(err => document.getElementById('auth-error').textContent = "Email atau password salah.");
    });
    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value, pass = document.getElementById('register-password').value;
        createUserWithEmailAndPassword(auth, email, pass).catch(err => {
            let msg = "Terjadi kesalahan.";
            if (err.code === 'auth/email-already-in-use') msg = "Email ini sudah terdaftar.";
            else if (err.code === 'auth/weak-password') msg = "Password minimal 6 karakter.";
            else if (err.code === 'auth/invalid-email') msg = "Format email tidak valid.";
            document.getElementById('auth-error').textContent = msg;
        });
    });
}

function setupAppListeners() {
    if (appListenersAttached) return;
    
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

    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    document.querySelectorAll('.tab-item').forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); switchTab(el.id.split('-')[1]); }));
    
    document.getElementById('btn-add-pelanggan').addEventListener('click', () => { 
        document.getElementById('form-pelanggan').reset(); 
        document.getElementById('pelanggan-id').value = '';
        const newCustomerId = generateUniqueCustomerId();
        document.getElementById('id-pelanggan-display').value = newCustomerId;

        document.getElementById('join-date').value = new Date().toISOString().split('T')[0];
        let pkgSelect = document.getElementById('paket-pelanggan');
        pkgSelect.innerHTML = '<option value="">-- Pilih Paket --</option>' + allPackages.map(p => `<option value="${p.id}">${p.nama}</option>`).join('');
        document.getElementById('modal-pelanggan-title').textContent = 'Tambah Pelanggan Baru'; 
        openModal(document.getElementById('modal-pelanggan')); 
    });
    document.getElementById('btn-add-paket').addEventListener('click', () => { 
        document.getElementById('form-paket').reset(); 
        document.getElementById('paket-id').value = ''; 
        document.getElementById('modal-paket-title').textContent = 'Tambah Paket Baru'; 
        openModal(document.getElementById('modal-paket')); 
    });
    document.getElementById('btn-cancel-pelanggan').addEventListener('click', () => closeModal(document.getElementById('modal-pelanggan')));
    document.getElementById('btn-cancel-paket').addEventListener('click', () => closeModal(document.getElementById('modal-paket')));
    document.getElementById('btn-cancel-tagihan').addEventListener('click', () => closeModal(document.getElementById('modal-tagihan')));
    document.getElementById('btn-cancel-hapus').addEventListener('click', () => closeModal(document.getElementById('modal-konfirmasi')));
    document.getElementById('btn-cancel-chat').addEventListener('click', () => closeModal(document.getElementById('modal-chat-options')));

    document.getElementById('form-pelanggan').addEventListener('submit', (e) => { 
        e.preventDefault(); 
        saveCustomer({ 
            id: document.getElementById('pelanggan-id').value, 
            customerId: document.getElementById('id-pelanggan-display').value,
            nama: document.getElementById('nama').value, 
            alamat: document.getElementById('alamat').value, 
            hp: document.getElementById('hp').value, 
            paketId: document.getElementById('paket-pelanggan').value, 
            joinDate: document.getElementById('join-date').value 
        }); 
    });

    document.getElementById('form-paket').addEventListener('submit', (e) => { e.preventDefault(); savePackage({ id: document.getElementById('paket-id').value, nama: document.getElementById('nama-paket').value, kecepatan: document.getElementById('kecepatan').value, harga: document.getElementById('harga').value, hargaProrate: document.getElementById('harga-prorate').value }); });
    document.getElementById('form-tagihan').addEventListener('submit', (e) => { 
        e.preventDefault(); 
        saveInvoice({ 
            id: document.getElementById('tagihan-id').value, 
            jumlah: document.getElementById('tagihan-jumlah').value, 
            periode: document.getElementById('tagihan-periode').value
        }); 
    });
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('button'); if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('btn-edit-pelanggan')) {
            const c = allCustomers.find(cust => cust.id === id); if (!c) return;
            document.getElementById('pelanggan-id').value = c.id; 
            document.getElementById('id-pelanggan-display').value = c.customerId || 'N/A';
            document.getElementById('nama').value = c.nama; 
            document.getElementById('alamat').value = c.alamat; 
            document.getElementById('hp').value = c.hp; 
            document.getElementById('join-date').value = c.joinDate;
            let pkgSelect = document.getElementById('paket-pelanggan');
            pkgSelect.innerHTML = allPackages.map(p => `<option value="${p.id}" ${p.id === c.paketId ? 'selected' : ''}>${p.nama}</option>`).join('');
            document.getElementById('modal-pelanggan-title').textContent = 'Edit Data Pelanggan'; 
            openModal(document.getElementById('modal-pelanggan'));
        } else if (btn.classList.contains('btn-delete-pelanggan')) {
            deleteCallback = () => deleteCustomer(id); document.getElementById('konfirmasi-pesan').textContent = "Yakin ingin menghapus pelanggan ini? Tindakan ini tidak dapat dibatalkan."; openModal(document.getElementById('modal-konfirmasi'));
        } else if (btn.classList.contains('btn-chat')) {
            const customerId = btn.dataset.customerId;
            const customer = allCustomers.find(c => c.id === customerId);
            if (customer) {
                chatContext = { customerId: customer.id };
                document.getElementById('chat-customer-name').textContent = customer.nama;
                openModal(document.getElementById('modal-chat-options'));
                lucide.createIcons();
            }
        } else if (btn.classList.contains('btn-edit-paket')) {
            const p = allPackages.find(pkg => pkg.id === id); if (!p) return;
            document.getElementById('paket-id').value = p.id; document.getElementById('nama-paket').value = p.nama; document.getElementById('kecepatan').value = p.kecepatan; document.getElementById('harga').value = p.harga; document.getElementById('harga-prorate').value = p.hargaProrate || '';
            document.getElementById('modal-paket-title').textContent = 'Edit Data Paket'; openModal(document.getElementById('modal-paket'));
        } else if (btn.classList.contains('btn-delete-paket')) {
            deleteCallback = () => deletePackage(id); document.getElementById('konfirmasi-pesan').textContent = "Yakin ingin menghapus paket ini?"; openModal(document.getElementById('modal-konfirmasi'));
        } else if (btn.classList.contains('btn-bayar-tagihan')) { 
            updateInvoiceStatus(id, 'lunas'); 
        } else if (btn.classList.contains('btn-edit-tagihan')) {
            const inv = allInvoices.find(i => i.id === id); if (!inv) return;
            const customer = allCustomers.find(c => c.id === inv.pelangganId);
            document.getElementById('tagihan-id').value = inv.id;
            document.getElementById('tagihan-pelanggan-nama').value = customer ? customer.nama : 'Pelanggan Terhapus';
            document.getElementById('tagihan-periode').value = inv.periode;
            document.getElementById('tagihan-jumlah').value = inv.jumlah;
            openModal(document.getElementById('modal-tagihan'));
        } else if (btn.classList.contains('btn-delete-tagihan')) {
            deleteCallback = () => deleteInvoice(id); 
            document.getElementById('konfirmasi-pesan').textContent = "Yakin ingin menghapus tagihan ini?"; 
            openModal(document.getElementById('modal-konfirmasi'));
        } else if (btn.classList.contains('btn-verifikasi-pembayaran')) {
            const inv = allInvoices.find(i => i.id === id); if (!inv) return;
            const customer = allCustomers.find(c => c.id === inv.pelangganId);
            verificationInvoiceId = id;
            document.getElementById('verifikasi-nama-pelanggan').textContent = customer ? customer.nama : 'Terhapus';
            document.getElementById('verifikasi-jumlah').textContent = formatRupiah(inv.jumlah);
            document.getElementById('verifikasi-link-bukti').href = inv.proofOfPaymentURL;
            document.getElementById('verifikasi-gambar-bukti').src = inv.proofOfPaymentURL;
            openModal(document.getElementById('modal-verifikasi'));
        }
    });

    document.getElementById('btn-send-customer-data').addEventListener('click', () => {
        const { customerId } = chatContext;
        const customer = allCustomers.find(c => c.id === customerId);
        if (!customer) return showToast('Data pelanggan tidak ditemukan.', 'error');

        const phone = formatPhoneNumber(customer.hp);
        if (!phone) return showToast('Nomor HP pelanggan tidak valid.', 'error');

        const pkg = allPackages.find(p => p.id === customer.paketId) || { nama: 'N/A', kecepatan: '' };

        const message = `Halo Kak *${customer.nama}* 👋\n\nTerima kasih telah menjadi pelanggan setia JagaNetwork! 🙏\n\nBerikut adalah detail data kepelangganan Anda:\n-----------------------------------\n👤 *Nama:* ${customer.nama}\n💳 *ID Pelanggan:* ${customer.customerId}\n🏠 *Alamat:* ${customer.alamat}\n🚀 *Paket Layanan:* ${pkg.nama} (${pkg.kecepatan})\n-----------------------------------\n\nJika ada data yang perlu diubah, silakan balas pesan ini.\n\nTerima kasih,\nAdmin JagaNetwork`;
        
        const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        closeModal(document.getElementById('modal-chat-options'));
    });

    document.getElementById('btn-send-invoice-info').addEventListener('click', () => {
        const { customerId } = chatContext;
        const customer = allCustomers.find(c => c.id === customerId);
        if (!customer) return showToast('Data pelanggan tidak ditemukan.', 'error');

        const phone = formatPhoneNumber(customer.hp);
        if (!phone) return showToast('Nomor HP pelanggan tidak valid.', 'error');
        
        const latestUnpaidInvoice = allInvoices
            .filter(inv => inv.pelangganId === customerId && inv.status === 'belum lunas')
            .sort((a, b) => new Date(b.periode) - new Date(a.periode))[0];

        if (!latestUnpaidInvoice) {
            return showToast('Tidak ada tagihan yang belum lunas untuk pelanggan ini.', 'info');
        }
        
        const message = [
            `Halo Kak *${customer.nama}* 👋`,
            "",
            "‼️ *PENGINGAT TAGIHAN JARINGAN* ‼️",
            "",
            "Kami ingin menginformasikan bahwa tagihan internet Anda untuk periode berikut telah jatuh tempo:",
            "",
            "🧾 *Detail Tagihan:*",
            "-----------------------------------",
            `*Periode:* ${getBillingPeriodText(latestUnpaidInvoice, customer)}`,
            `*Jumlah:* *${formatRupiah(latestUnpaidInvoice.jumlah)}*`,
            "-----------------------------------",
            "",
            "Untuk menghindari gangguan layanan, mohon segera lakukan pembayaran melalui Portal Pembayaran kami di bawah ini:",
            "",
            "👉 *Link Pembayaran:*",
            "https://payment-gateway-wheat-nine.vercel.app/",
            "",
            `Cukup masukkan ID Pelanggan Anda: *${customer.customerId}*`,
            "",
            "Jika sudah melakukan pembayaran, mohon abaikan pesan ini.",
            "",
            "Terima kasih atas perhatiannya,",
            "Admin JagaNetwork"
        ].join('\n');


        const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        closeModal(document.getElementById('modal-chat-options'));
    });


    document.getElementById('btn-confirm-hapus').addEventListener('click', () => { if (deleteCallback) { deleteCallback(); } closeModal(document.getElementById('modal-konfirmasi')); });
    document.getElementById('btn-generate-tagihan').addEventListener('click', generateInvoices);
    document.getElementById('btn-generate-prorate').addEventListener('click', generateProrateInvoices);
    document.getElementById('laporan-filter-bulan').addEventListener('change', renderLaporan); 
    document.getElementById('laporan-filter-tahun').addEventListener('change', renderLaporan);
    
    document.getElementById('btn-konfirmasi-pembayaran').addEventListener('click', () => {
        if (verificationInvoiceId) {
            updateInvoiceStatus(verificationInvoiceId, 'lunas');
            closeModal(document.getElementById('modal-verifikasi'));
            verificationInvoiceId = null;
        }
    });
    document.getElementById('btn-tolak-pembayaran').addEventListener('click', () => {
        if (verificationInvoiceId) {
            updateInvoiceStatus(verificationInvoiceId, 'belum lunas', true);
            closeModal(document.getElementById('modal-verifikasi'));
            verificationInvoiceId = null;
        }
    });


    appListenersAttached = true;
}

lucide.createIcons();
setupAuthListeners();

