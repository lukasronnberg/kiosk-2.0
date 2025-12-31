import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, addDoc, updateDoc, doc, increment, Timestamp } from 'firebase/firestore';
import emailjs from '@emailjs/browser';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useKioskData } from './hooks/useKioskData';
import { useCart } from './hooks/useCart';

// Komponenter
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import ProductGrid from './components/ProductGrid';
import EconomyView from './components/EconomyView';
import ModalManager from './components/ModalManager';

// Styles
import styles from './styles/App.module.css';

// Konstanter
const CAMP_START_DATE = new Date(import.meta.env.VITE_CAMP_START_DATE || "2025-12-30");
const SWISH_NUMBER = import.meta.env.VITE_SWISH_NUMBER || "123 456 78 90";
const TEST_EMAIL_OVERRIDE = import.meta.env.VITE_TEST_EMAIL_OVERRIDE || "lukas.e.e.ronnberg@gmail.com";

function App() {
  const { isAuthenticated, verifyPin } = useAuth();
  
  const { 
    products, customers, reloadCustomers, fetchProducts,
    saveProduct, deleteProduct, saveCustomer 
  } = useKioskData(isAuthenticated);
  
  const { 
    cart, addToCart, updateCart, clearCart, totalSum, totalItems 
  } = useCart();

  // State
  const [adminMode, setAdminMode] = useState(false);
  const [economyMode, setEconomyMode] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Modal State
  const [modal, setModal] = useState({ isOpen: false, type: null });

  // --- HJÄLPFUNKTIONER ---

  const getCurrentCampWeek = () => {
    const today = new Date();
    if (today < CAMP_START_DATE) return 1;
    const diffTime = Math.abs(today - CAMP_START_DATE);
    const week = Math.ceil(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) / 7);
    return week > 0 ? week : 1;
  };

  const closeModal = () => setModal({ isOpen: false, type: null });

  // --- KÖP-LOGIK ---

  const initiatePurchase = () => {
    if (!selectedCustomer || cart.length === 0) return;
    
    // Konfirmand-koll
    const week = getCurrentCampWeek();
    const limit = week * 100;
    const isKonfirmand = selectedCustomer.type?.toLowerCase() === "konfirmand";

    if (isKonfirmand && (selectedCustomer.currentBalance + totalSum > limit)) {
      setModal({
        isOpen: true, type: 'error', title: "🛑 Köp nekat",
        message: `${selectedCustomer.name} når gränsen (${limit} kr) för vecka ${week}.`
      });
      return;
    }

    setModal({
      isOpen: true, type: 'confirm', title: 'Bekräfta köp',
      message: `Ska ${selectedCustomer.name} köpa ${totalItems} varor för ${totalSum} kr?`,
      onConfirm: executePurchase
    });
  };

  const executePurchase = async () => {
    setIsProcessing(true);
    closeModal(); // Stäng bekräftelsen
    try {
      const week = getCurrentCampWeek();
      const itemSummary = cart.map(i => ({ name: i.product.name, price: i.product.price, quantity: i.quantity }));
      
      // 1. Skapa transaktion
      await addDoc(collection(db, "transactions"), {
        customerId: selectedCustomer.id, 
        customerName: selectedCustomer.name,
        items: itemSummary, 
        totalAmount: totalSum, 
        timestamp: Timestamp.now(), 
        week: week,
        type: 'purchase'
      });
      
      // 2. Uppdatera kundsaldo
      await updateDoc(doc(db, "customers", selectedCustomer.id), {
        currentBalance: increment(totalSum), 
        totalSpent: increment(totalSum)
      });
      
      setModal({ isOpen: true, type: 'success', title: 'KÖP KLART!', message: `Sparat ${totalSum} kr.` });
      clearCart(); 
      setSelectedCustomer(null); 
      reloadCustomers();
    } catch (e) { 
      console.error(e);
      setModal({ isOpen: true, type: 'error', title: "❌ Fel", message: "Kunde inte genomföra köpet." }); 
    } finally { 
      setIsProcessing(false); 
    }
  };

  // --- BETALNING & ÅNGRA (EKONOMI) ---

  const handleRegisterPayment = async (amount) => {
    const amountToPay = parseFloat(amount);
    const customer = modal.data;
    if (!customer || isNaN(amountToPay) || amountToPay <= 0) return;

    try {
      await addDoc(collection(db, "transactions"), {
        customerId: customer.id, customerName: customer.name,
        totalAmount: -amountToPay, amountPaid: amountToPay,
        timestamp: Timestamp.now(), type: 'payment_registered'
      });
      await updateDoc(doc(db, "customers", customer.id), {
        currentBalance: increment(-amountToPay)
      });
      closeModal();
      reloadCustomers();
    } catch (e) { console.error(e); }
  };

  const handleUndoPayment = async (amount) => {
    const amountToAdd = parseFloat(amount);
    const customer = modal.data;
    if (!customer || isNaN(amountToAdd) || amountToAdd <= 0) return;

    try {
      await addDoc(collection(db, "transactions"), {
        customerId: customer.id, customerName: customer.name,
        totalAmount: amountToAdd,
        timestamp: Timestamp.now(), type: 'payment_undo'
      });
      await updateDoc(doc(db, "customers", customer.id), {
        currentBalance: increment(amountToAdd)
      });
      closeModal();
      reloadCustomers();
    } catch (e) { console.error(e); }
  };

  // --- EMAIL HANTERING ---

  const handleEmailAll = (type) => {
    const debtors = customers.filter(c => c.currentBalance > 0);
    setModal({
      isOpen: true, type: 'confirm-mass-email',
      title: type === 'invoice' ? 'Skicka Fakturor?' : 'Skicka Påminnelser?',
      message: `Skickar till ${debtors.length} personer (Testmail: ${TEST_EMAIL_OVERRIDE})`,
      onConfirm: () => processMassEmail(type, debtors)
    });
  };

  const processMassEmail = async (type, debtors) => {
    closeModal();
    setIsProcessing(true);
    let count = 0;
    
    for (const customer of debtors) {
        if (!customer.email) continue; // Hoppa över om mail saknas
        
        const templateId = type === 'reminder' 
          ? import.meta.env.VITE_EMAILJS_REMINDER_TEMPLATE_ID 
          : import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
        
        try {
          await emailjs.send(
            import.meta.env.VITE_EMAILJS_SERVICE_ID,
            templateId || import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
            {
              // HÄR ÄR ÄNDRINGEN: Nu skickar vi till kundens riktiga mail
              to_email: customer.email, 
              to_name: customer.name,
              amount: customer.currentBalance,
              swish_number: SWISH_NUMBER
            },
            import.meta.env.VITE_EMAILJS_PUBLIC_KEY
          );
          count++;
          await new Promise(r => setTimeout(r, 400)); // Rate limit för att inte bli blockad
        } catch (e) { console.error("Misslyckades skicka till " + customer.name, e); }
    }
    setIsProcessing(false);
    setModal({ isOpen: true, type: 'success', title: "✅ Klart!", message: `Skickade ${count} mail skarpt.` });
  };

  // --- TANGENTBORDSSHORTCUTS ---

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isAuthenticated) return;
      if (e.key === 'Enter') {
        if (modal.isOpen && modal.onConfirm) {
           // Hanteras oftast av knappen i modalen, men vi kan lägga till global confirm här om vi vill
        } else if (!modal.isOpen && selectedCustomer && cart.length > 0 && !isProcessing && !adminMode) {
          e.preventDefault();
          initiatePurchase();
        }
      }
      if (e.key === 'Escape') {
        if (modal.isOpen) closeModal();
        else if (economyMode) setEconomyMode(false);
        else {
          setSelectedCustomer(null);
          clearCart();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, modal, selectedCustomer, cart, isProcessing, economyMode, adminMode]);


  // --- RENDER ---

  if (!isAuthenticated) {
    return <LoginScreen onLogin={verifyPin} />;
  }

  return (
    <div className={`${styles.appContainer} ${adminMode ? styles.adminActive : ''}`}>
      
      {/* ADMIN BANNER */}
      {adminMode && (
        <div className={styles.adminBanner}>
          <span>🔧 ADMIN-LÄGE</span>
          <span 
            className={styles.adminLink} 
            onClick={() => setEconomyMode(!economyMode)}
            style={{ color: economyMode ? 'black' : 'white' }}
          >
            {economyMode ? '⬅ TILLBAKA TILL KASSAN' : '💰 EKONOMI & SKULDER'}
          </span>
        </div>
      )}

      {/* POPUPS (MODALS) */}
      <ModalManager 
        modal={modal} 
        close={closeModal}
        customers={customers}
        products={products}
        actions={{
          saveCustomer, 
          saveProduct,
          openManageCustomers: () => setModal({ isOpen: true, type: 'manage-customers' }),
          openEditCustomer: (c) => setModal({ isOpen: true, type: 'edit-customer', data: c }),
          registerPayment: handleRegisterPayment, // Callback från modal input
          undoPayment: handleUndoPayment
        }}
      />

      {/* VYER */}
      {economyMode ? (
        <EconomyView 
          customers={customers}
          isProcessing={isProcessing}
          onEmailAll={handleEmailAll}
          onOpenPayment={(c) => setModal({ 
            isOpen: true, type: 'register-payment', 
            title: `Betalning: ${c.name}`, 
            message: `Skuld: ${c.currentBalance} kr`,
            inputValue: c.currentBalance,
            data: c,
            onConfirm: handleRegisterPayment 
          })}
          onUndoPayment={(c) => setModal({ 
            isOpen: true, type: 'undo-payment', 
            title: `Ångra: ${c.name}`, 
            message: "Belopp att lägga tillbaka på skuld:",
            inputValue: c.totalSpent || 0,
            data: c,
            onConfirm: handleUndoPayment
          })}
        />
      ) : (
        <>
          <Sidebar 
            cart={cart}
            totalSum={totalSum}
            customers={customers}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
            onUpdateCart={updateCart}
            onCheckout={initiatePurchase}
            isProcessing={isProcessing}
            adminMode={adminMode}
            onManageCustomers={() => setModal({ isOpen: true, type: 'manage-customers' })}
          />

          <ProductGrid 
            products={products}
            adminMode={adminMode}
            toggleAdmin={() => { setAdminMode(!adminMode); setEconomyMode(false); }}
            onProductClick={addToCart}
            onEditProduct={(p) => setModal({ isOpen: true, type: 'edit-product', data: p, onConfirm: (d) => saveProduct(d, p?.id) })}
            onDeleteProduct={deleteProduct}
          />
        </>
      )}
    </div>
  );
}

export default App;