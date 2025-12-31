import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from './firebase';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, increment, Timestamp } from 'firebase/firestore';
import emailjs from '@emailjs/browser';
import './App.css';

const CAMP_START_DATE = new Date(import.meta.env.VITE_CAMP_START_DATE || "2025-12-30");
const SITE_PIN = import.meta.env.VITE_APP_PIN || "0000";
const SWISH_NUMBER = import.meta.env.VITE_SWISH_NUMBER || "123 456 78 90";
const TEST_EMAIL_OVERRIDE = import.meta.env.VITE_TEST_EMAIL_OVERRIDE || "lukas.e.e.ronnberg@gmail.com";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [cart, setCart] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [adminMode, setAdminMode] = useState(false);
  const [economyMode, setEconomyMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState("ALLA");
  
  // MODAL STATE - Nu mer flexibel
  const [modal, setModal] = useState({ isOpen: false, type: 'confirm', title: '', message: '', data: null, onConfirm: null, inputValue: '' });
  const [formData, setFormData] = useState({});
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const searchInputRef = useRef(null);
  const modalInputRef = useRef(null); // Ref för att fokusera i popups

  useEffect(() => {
    if (isAuthenticated) {
      fetchProducts();
      reloadCustomers();
    }
  }, [isAuthenticated]);

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pinInput === SITE_PIN) {
      setIsAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput("");
      setTimeout(() => setPinError(false), 1000);
    }
  };

  useEffect(() => {
    let timer;
    if (modal.isOpen && modal.type === 'success') {
      timer = setTimeout(() => closeModal(), 1500); // Lite snabbare stängning för speed
    }
    // Auto-fokus på input i modaler
    if (modal.isOpen && (modal.type === 'register-payment' || modal.type === 'undo-payment')) {
      setTimeout(() => modalInputRef.current?.focus(), 50);
    }
    return () => clearTimeout(timer);
  }, [modal]);

  const fetchProducts = async () => {
    try {
      const prodSnap = await getDocs(collection(db, "products"));
      const prodList = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      prodList.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(prodList);
    } catch (error) { console.error(error); }
  };

  const reloadCustomers = async () => {
    try {
      const custSnap = await getDocs(collection(db, "customers"));
      const custList = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      custList.sort((a, b) => a.name.localeCompare(b.name));
      setCustomers(custList);
    } catch (error) { console.error(error); }
  };

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || "Övrigt"));
    return ["ALLA", ...Array.from(cats).sort()];
  }, [products]);

  const availableCategories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || "Övrigt"));
    return Array.from(cats).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (activeCategory === "ALLA") return products;
    return products.filter(p => (p.category || "Övrigt") === activeCategory);
  }, [products, activeCategory]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const lower = customerSearch.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(lower));
  }, [customerSearch, customers]);

  const debtors = useMemo(() => {
    return customers.filter(c => c.currentBalance > 0).sort((a, b) => b.currentBalance - a.currentBalance);
  }, [customers]);

  const paidCustomers = useMemo(() => {
    return customers.filter(c => c.currentBalance <= 0 && c.totalSpent > 0).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers]);

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(""); 
    setIsSearching(false);
  };

  const addToCart = (product) => {
    if (adminMode) return;
    setCart(prevCart => {
      const existing = prevCart.find(item => item.product.id === product.id);
      if (existing) {
        return prevCart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      } else {
        return [...prevCart, { product, quantity: 1, cartId: Date.now() }];
      }
    });
  };

  const decreaseQuantity = (productId) => {
    setCart(prevCart => {
      return prevCart.map(item => {
        if (item.product.id === productId) {
          return { ...item, quantity: item.quantity - 1 };
        }
        return item;
      }).filter(item => item.quantity > 0);
    });
  };

  const clearCart = () => setCart([]);
  const totalSum = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const getCurrentCampWeek = () => {
    const today = new Date();
    if (today < CAMP_START_DATE) return 1;
    const diffTime = Math.abs(today - CAMP_START_DATE);
    const week = Math.ceil(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) / 7);
    return week > 0 ? week : 1;
  };

  const isKonfirmand = (c) => c && c.type && c.type.toLowerCase().trim() === "konfirmand";

  const initiatePurchase = () => {
    if (!selectedCustomer || cart.length === 0) return;
    const week = getCurrentCampWeek();
    const limit = week * 100;
    
    if (isKonfirmand(selectedCustomer)) {
      if ((selectedCustomer.currentBalance || 0) + totalSum > limit) {
        return showAlert("🛑 Köp nekat", `${selectedCustomer.name} når gränsen (${limit} kr).`, true);
      }
    }
    setModal({
      isOpen: true, type: 'confirm', title: 'Bekräfta köp',
      message: `Ska ${selectedCustomer.name} köpa ${totalItems} varor för ${totalSum} kr?`,
      onConfirm: executePurchase
    });
  };

  const executePurchase = async () => {
    setIsProcessing(true);
    try {
      const week = getCurrentCampWeek();
      const itemSummary = cart.map(i => ({ name: i.product.name, price: i.product.price, quantity: i.quantity }));
      
      await addDoc(collection(db, "transactions"), {
        customerId: selectedCustomer.id, 
        customerName: selectedCustomer.name,
        items: itemSummary, 
        totalAmount: totalSum, 
        timestamp: Timestamp.now(), 
        week: week,
        type: 'purchase'
      });
      
      await updateDoc(doc(db, "customers", selectedCustomer.id), {
        currentBalance: increment(totalSum), 
        totalSpent: increment(totalSum)
      });
      
      setModal({ isOpen: true, type: 'success', title: 'KÖP KLART!', message: `Sparat ${totalSum} kr.`, onConfirm: null });
      setCart([]); 
      setSelectedCustomer(null); 
      await reloadCustomers();
    } catch (e) { 
      console.error(e);
      showAlert("❌ Fel", "Kunde inte genomföra köpet."); 
    } finally { 
      setTimeout(() => setIsProcessing(false), 2000); 
    }
  };

  // --- MAIL LOGIC ---
  const handleSendEmail = async (customer, type = 'invoice', silent = false) => {
    if (!customer.email && !silent) return alert("Ingen e-post angiven för denna kund.");
    
    const templateId = type === 'reminder' 
      ? import.meta.env.VITE_EMAILJS_REMINDER_TEMPLATE_ID 
      : import.meta.env.VITE_EMAILJS_TEMPLATE_ID;

    const finalTemplateId = templateId || import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const emailToSend = TEST_EMAIL_OVERRIDE; 

    const templateParams = {
      to_email: emailToSend, 
      original_customer_email: customer.email,
      to_name: customer.name,
      amount: customer.currentBalance,
      swish_number: SWISH_NUMBER
    };

    try {
      await emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID,
        finalTemplateId,
        templateParams,
        import.meta.env.VITE_EMAILJS_PUBLIC_KEY
      );
      if(!silent) showAlert("✅ Skickat!", `${type === 'reminder' ? 'Påminnelse' : 'Faktura'} skickad till ${customer.name} (via testmail).`);
      return true;
    } catch (error) {
      console.error("EmailJS Error:", error);
      if(!silent) showAlert("❌ Fel", "Kunde inte skicka mailet.");
      return false;
    }
  };

  // MAIL ALL BUTTON
  const handleEmailAll = async (type) => {
    setModal({
        isOpen: true,
        type: 'confirm-mass-email',
        title: type === 'invoice' ? 'Skicka Fakturor?' : 'Skicka Påminnelser?',
        message: `Detta skickar mail till ALLA ${debtors.length} personer med skuld.\n(Skickas till testmail: ${TEST_EMAIL_OVERRIDE})`,
        onConfirm: () => processMassEmail(type)
    });
  };

  const processMassEmail = async (type) => {
    closeModal(); // Stäng modal direkt
    setIsProcessing(true);
    let count = 0;
    
    // Vi kör mailutskicken i bakgrunden utan att låsa UI för mycket
    for (const customer of debtors) {
        if (customer.email) {
            await handleSendEmail(customer, type, true); // Silent mode
            count++;
            await new Promise(r => setTimeout(r, 400)); // Rate limit
        }
    }
    setIsProcessing(false);
    showAlert("✅ Klart!", `Skickade ${count} st ${type === 'invoice' ? 'fakturor' : 'påminnelser'}.`);
  };

  // REGISTRERA BETALNING - EGEN POPUP
  const openRegisterPayment = (customer) => {
    setModal({
        isOpen: true,
        type: 'register-payment',
        title: `Betalning: ${customer.name}`,
        message: `Nuvarande skuld: ${customer.currentBalance} kr`,
        inputValue: customer.currentBalance, // Default till hela skulden
        data: customer,
        onConfirm: (amount) => executeRegisterPayment(customer, amount)
    });
  };

  const executeRegisterPayment = async (customer, amount) => {
    const amountToPay = parseFloat(amount);
    if (isNaN(amountToPay) || amountToPay <= 0) return alert("Ogiltigt belopp.");
    if (amountToPay > customer.currentBalance) return alert("Beloppet är större än skulden.");

    try {
      await addDoc(collection(db, "transactions"), {
        customerId: customer.id,
        customerName: customer.name,
        totalAmount: -amountToPay, 
        amountPaid: amountToPay,
        timestamp: Timestamp.now(),
        type: 'payment_registered'
      });
      await updateDoc(doc(db, "customers", customer.id), {
        currentBalance: increment(-amountToPay)
      });
      // Stäng modalen direkt utan success-meddelande för speed
      closeModal();
      reloadCustomers();
    } catch (e) {
      console.error(e);
      showAlert("❌ Fel", "Kunde inte registrera betalning.");
    }
  };

  // ÅNGRA BETALNING - EGEN POPUP
  const openUndoPayment = (customer) => {
    // Default: Totalen de spenderat (bästa gissningen på "originalbeloppet" om de nollat allt)
    setModal({
        isOpen: true,
        type: 'undo-payment',
        title: `Ångra betalning: ${customer.name}`,
        message: "Hur mycket skuld ska läggas tillbaka?",
        inputValue: customer.totalSpent || 0,
        data: customer,
        onConfirm: (amount) => executeUndoPayment(customer, amount)
    });
  };

  const executeUndoPayment = async (customer, amount) => {
    const amountToAdd = parseFloat(amount);
    if (isNaN(amountToAdd) || amountToAdd <= 0) return alert("Ogiltigt belopp.");

    try {
        await addDoc(collection(db, "transactions"), {
            customerId: customer.id,
            customerName: customer.name,
            totalAmount: amountToAdd,
            timestamp: Timestamp.now(),
            type: 'payment_undo'
        });
        await updateDoc(doc(db, "customers", customer.id), {
            currentBalance: increment(amountToAdd)
        });
        closeModal();
        reloadCustomers();
    } catch (e) {
        alert("Kunde inte ångra.");
    }
  };

  // HANTERA ENTER I POPUPS
  const handleModalKeyDown = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        // Hämta värdet från ref eller state beroende på implementering, här litar vi på modalens interna input
        const val = modalInputRef.current?.value;
        if (val && modal.onConfirm) modal.onConfirm(val);
    }
  };

  // --- MODAL & FORM HANDLERS ---
  const toggleAdmin = () => { setAdminMode(!adminMode); setEconomyMode(false); };
  const closeModal = () => { setModal({ ...modal, isOpen: false }); setFormData({}); setIsCreatingCategory(false); };
  const showAlert = (title, message, isError = false) => setModal({ isOpen: true, type: isError ? 'error' : 'success', title, message, onConfirm: closeModal });
  const openCustomerManager = () => setModal({ isOpen: true, type: 'manage-customers', title: 'Hantera Kunder' });
  
  const openCustomerEdit = (c=null) => {
    setFormData(c || { name: '', type: 'Konfirmand', currentBalance: 0, email: '' });
    setModal({ isOpen:true, type:'edit-customer', title: c ? 'Redigera' : 'Ny', onConfirm: (data) => saveCustomer(data, c?.id) });
  };
  
  const saveCustomer = async (data, id) => { 
    try { 
      const balance = Number(data.currentBalance) || 0;
      if(id) await updateDoc(doc(db,"customers",id), { ...data, currentBalance: balance }); 
      else await addDoc(collection(db,"customers"),{ ...data, currentBalance: balance }); 
      closeModal(); reloadCustomers(); setTimeout(openCustomerManager, 300); 
    } catch(e){ alert("Kunde inte spara kund."); } 
  };
  
  const openProductModal = (p=null) => {
    setFormData(p || { name: '', price: '', category: 'Övrigt' });
    setModal({ isOpen:true, type:'edit-product', title: p ? 'Redigera' : 'Ny vara', onConfirm: (data) => saveProduct(data, p?.id) });
  };

  const saveProduct = async (data, id) => { 
    try { 
      const p = parseInt(data.price); 
      const finalCategory = data.category === 'NEW_CAT_OPTION' ? data.newCategory : data.category;
      if (!finalCategory) return alert("Ange en kategori!");
      if(id) await updateDoc(doc(db,"products",id),{ name: data.name, price: p, category: finalCategory }); 
      else await addDoc(collection(db,"products"),{ name: data.name, price: p, category: finalCategory }); 
      closeModal(); fetchProducts(); 
    } catch(e){ alert("Kunde inte spara produkt."); } 
  };

  const deleteProduct = async (p) => { if(confirm("Radera " + p.name + "?")) { await deleteDoc(doc(db,"products",p.id)); fetchProducts(); }};
  const handleInputChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); 
      if (filteredCustomers.length > 0) selectCustomer(filteredCustomers[0]);
    }
  };

  // --- TANGENTBORDS-HANTERING (Shortcuts) ---
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (!isAuthenticated) return; 

      // 1. ENTER: Hantera Köp-flödet snabbt
      if (e.key === 'Enter') {
        
        // Scenario A: Modalen "Bekräfta köp" är öppen -> Bekräfta direkt
        if (modal.isOpen && modal.type === 'confirm') {
          e.preventDefault();
          modal.onConfirm();
          return;
        }

        // Scenario B: Vi står i kassan (ingen modal), har Kund & Varor -> Starta köp
        // (Kollar också att vi inte håller på att söka i input-fältet just nu)
        if (
            !modal.isOpen && 
            selectedCustomer && 
            cart.length > 0 && 
            !isProcessing &&
            document.activeElement !== searchInputRef.current // Så man inte råkar köpa när man söker
        ) {
          e.preventDefault();
          initiatePurchase();
          return;
        }
      }

      // 2. ESCAPE: Stäng / Rensa
      if (e.key === 'Escape') {
        if (modal.isOpen) closeModal();
        else if (economyMode) setEconomyMode(false); 
        else {
          // Rensa allt ("Panic button")
          setSelectedCustomer(null);
          setCart([]);
          setCustomerSearch("");
          setIsSearching(false);
          if (document.activeElement === searchInputRef.current) document.activeElement.blur();
        }
        return; 
      }

      // 3. AUTO-FOKUS PÅ SÖKFÄLT (Om man börjar skriva)
      // Gäller bara om man inte är i admin, inte har vald kund, ingen modal är uppe
      if (
        !adminMode && 
        !selectedCustomer && 
        !modal.isOpen && 
        e.key.length === 1 && 
        !e.ctrlKey && !e.metaKey && !e.altKey
      ) {
        if (document.activeElement !== searchInputRef.current) searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    
    // VIKTIGT: Vi måste ha med cart, selectedCustomer etc i dependency array
    // annars "ser" inte event-lyssnaren att du lagt till varor i korgen.
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    modal, 
    adminMode, 
    selectedCustomer, 
    isAuthenticated, 
    economyMode, 
    cart,           // <--- Viktig för att veta om vi får köpa
    isProcessing
  ]);

  if (!isAuthenticated) {
    return (
      <div className="login-screen">
        <div className="login-box">
          <img src="logo.png" alt="Logo" className="login-logo" onError={(e) => e.target.style.display = 'none'}/>
          <h1>Prästbyrån Kassa</h1>
          <p>Ange PIN-kod för att öppna</p>
          <form onSubmit={handlePinSubmit}>
            <input type="password" value={pinInput} onChange={(e) => setPinInput(e.target.value)} className={`pin-input ${pinError ? 'error' : ''}`} placeholder="****" autoFocus maxLength={4} />
            <button type="submit" className="login-btn">Öppna</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${adminMode ? 'admin-active' : ''}`}>
      {adminMode && (
        <div className="admin-mode-banner">
          <div style={{display:'flex', gap:'20px', justifyContent:'center'}}>
            <span>🔧 ADMIN-LÄGE</span>
            <span onClick={() => setEconomyMode(!economyMode)} style={{cursor:'pointer', textDecoration:'underline', fontWeight:'900', color: economyMode ? 'black' : 'white'}}>
              {economyMode ? '⬅ TILLBAKA TILL KASSAN' : '💰 EKONOMI & SKULDER'}
            </span>
          </div>
        </div>
      )}
      
      {modal.isOpen && (
        <div className="modal-overlay">
          <div className={`modal-box ${modal.type === 'success' ? 'success-mode' : ''}`}>
            {modal.type === 'success' && <div className="success-icon">✅</div>}
            <h2 className="modal-title">{modal.title}</h2>
            
            {/* --- GENERIC CONFIRM / MESSAGE --- */}
            {(modal.type === 'confirm' || modal.type === 'confirm-mass-email' || modal.type === 'error' || modal.type === 'success') && (
              <>
                <p className="modal-message">{modal.message}</p>
                <div className="modal-buttons">
                  {(modal.type.includes('confirm')) && (
                    <>
                      <button className="btn-modal btn-cancel" onClick={closeModal}>AVBRYT</button>
                      <button className="btn-modal btn-confirm" onClick={modal.onConfirm}>JA, FORTSÄTT</button>
                    </>
                  )}
                  {modal.type === 'error' && <button className="btn-modal btn-cancel" onClick={closeModal}>OK</button>}
                </div>
              </>
            )}

            {/* --- CUSTOM INPUT PROMPTS (Payment/Undo) --- */}
            {(modal.type === 'register-payment' || modal.type === 'undo-payment') && (
                <div>
                    <p className="modal-message">{modal.message}</p>
                    <input 
                        ref={modalInputRef}
                        type="number" 
                        defaultValue={modal.inputValue} 
                        className="admin-form input"
                        style={{fontSize: '1.5rem', textAlign: 'center', width: '100%', marginBottom: '20px'}}
                        onKeyDown={handleModalKeyDown}
                    />
                    <div className="modal-buttons">
                        <button className="btn-modal btn-cancel" onClick={closeModal}>AVBRYT</button>
                        <button className="btn-modal btn-confirm" onClick={() => modal.onConfirm(modalInputRef.current.value)}>
                            {modal.type === 'register-payment' ? 'BEKRÄFTA' : 'ÅTERSTÄLL'}
                        </button>
                    </div>
                </div>
            )}

            {/* --- MANAGE CUSTOMERS --- */}
            {modal.type === 'manage-customers' && (
               <div>
                 <button className="btn-modal btn-confirm btn-full-width" onClick={()=>openCustomerEdit()}>+ Ny Kund</button>
                 <div className="admin-list-container">
                   {customers.map(c => (
                     <div key={c.id} className="customer-list-row">
                       <div className="customer-row-info"><strong>{c.name}</strong><br/><span className="customer-row-type">{c.type}</span></div>
                       <div><button className="btn-admin-action btn-edit" onClick={()=>openCustomerEdit(c)}>✏️</button></div>
                     </div>
                   ))}
                 </div>
                 <div className="modal-close-container"><button className="btn-modal btn-cancel" onClick={closeModal}>Stäng</button></div>
               </div>
            )}
            
            {/* --- EDIT FORMS --- */}
            {modal.type === 'edit-customer' && (
               <div className="admin-form">
                 <label>Namn:</label><input value={formData.name || ''} onChange={(e) => handleInputChange('name', e.target.value)} autoFocus />
                 <label>Typ:</label><select value={formData.type || 'Konfirmand'} onChange={(e) => handleInputChange('type', e.target.value)}><option>Konfirmand</option><option>Hjon</option></select>
                 <label>Saldo:</label><input type="number" value={formData.currentBalance || 0} onChange={(e) => handleInputChange('currentBalance', e.target.value)} />
                 <label>E-post:</label><input type="email" value={formData.email || ''} onChange={(e) => handleInputChange('email', e.target.value)} placeholder="exempel@mail.se" />
                 <div className="modal-buttons"><button className="btn-modal btn-cancel" onClick={openCustomerManager}>Tillbaka</button><button className="btn-modal btn-confirm" onClick={() => modal.onConfirm(formData)}>SPARA</button></div>
               </div>
            )}
            {modal.type === 'edit-product' && (
              <div className="admin-form">
                <label>Namn:</label><input value={formData.name || ''} onChange={(e) => handleInputChange('name', e.target.value)} autoFocus />
                <label>Pris (kr):</label><input type="number" value={formData.price || ''} onChange={(e) => handleInputChange('price', e.target.value)} />
                <label>Kategori:</label>
                <select value={formData.category || 'Övrigt'} onChange={(e) => { handleInputChange('category', e.target.value); setIsCreatingCategory(e.target.value === 'NEW_CAT_OPTION'); }}>
                  {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}<option disabled>──────────</option><option value="NEW_CAT_OPTION">+ SKAPA NY KATEGORI...</option>
                </select>
                {isCreatingCategory && <input className="new-cat-input" placeholder="Skriv namn på ny kategori..." value={formData.newCategory || ''} onChange={(e) => handleInputChange('newCategory', e.target.value)} />}
                <div className="modal-buttons"><button className="btn-modal btn-cancel" onClick={closeModal}>Avbryt</button><button className="btn-modal btn-confirm" onClick={() => modal.onConfirm(formData)}>SPARA</button></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- ECONOMY VIEW --- */}
      {economyMode && adminMode ? (
        <div className="economy-view">
          <div className="economy-container">
            <div className="economy-header-row">
                <div>
                    <h1>💰 Skulder & Fakturering</h1>
                    <p style={{marginBottom:0, color:'#666'}}>All mailtrafik går just nu till: <strong>{TEST_EMAIL_OVERRIDE}</strong></p>
                </div>
                <div style={{display:'flex', gap:'10px'}}>
                    <button className="btn-action btn-email" onClick={() => handleEmailAll('invoice')} disabled={isProcessing}>
                       📄 Fakturera Alla
                    </button>
                    <button className="btn-action btn-reminder" onClick={() => handleEmailAll('reminder')} disabled={isProcessing}>
                       🔔 Påminn Alla
                    </button>
                </div>
            </div>

            <h3 className="section-title">🛑 Aktuella Skulder ({debtors.length} st)</h3>
            <div className="debt-list">
              <div className="debt-header">
                <span>Namn</span>
                <span>Skuld</span>
                <span>E-post</span>
                <span>Åtgärd</span>
              </div>
              {debtors.length === 0 && <div style={{padding:'20px', textAlign:'center', color:'#aaa'}}>Inga skulder just nu! 🎉</div>}
              {debtors.map(c => (
                <div key={c.id} className="debt-row">
                  <div><strong>{c.name}</strong><br/><span style={{fontSize:'0.8em', color:'#888'}}>{c.type}</span></div>
                  <span style={{color:'#e74c3c', fontWeight:'bold', fontSize:'1.1rem'}}>{c.currentBalance} kr</span>
                  <span style={{fontSize:'0.8rem', color: c.email ? '#333':'#ccc'}}>{c.email || '(Saknas)'}</span>
                  <div className="debt-actions">
                    <button className="btn-action btn-register-payment" onClick={() => openRegisterPayment(c)} title="Registrera betalning">
                        💸 Registrera Betalning
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="section-title" style={{marginTop:'40px', color:'#27ae60'}}>✅ Avslutade / Nollade ({paidCustomers.length} st)</h3>
            <div className="debt-list">
                <div className="debt-header">
                    <span>Namn</span>
                    <span>Status</span>
                    <span>Totalt köpt</span>
                    <span>Åtgärd</span>
                </div>
                {paidCustomers.map(c => (
                    <div key={c.id} className="debt-row">
                        <strong>{c.name}</strong>
                        <span style={{color:'#27ae60', fontWeight:'bold'}}>Skuldfri</span>
                        <span>{c.totalSpent} kr</span>
                        <div className="debt-actions">
                             <button className="btn-action btn-undo" onClick={() => openUndoPayment(c)}>↩️ Ångra (Lägg till skuld)</button>
                        </div>
                    </div>
                ))}
            </div>
          </div>
        </div>
      ) : (
        /* --- NORMAL KIOSK VIEW --- */
        <>
          <div className="cart-sidebar">
            <div className="cart-header">
              {!selectedCustomer ? (
                <div className="customer-search-container">
                  <h2 className="search-title">Välj Kund</h2>
                  <input type="text" className="search-input" placeholder="🔍 Sök eller välj i listan..." value={customerSearch} ref={searchInputRef} onKeyDown={handleSearchKeyDown} onChange={(e) => { setCustomerSearch(e.target.value); setIsSearching(true); }} onFocus={() => setIsSearching(true)} onBlur={() => setTimeout(() => setIsSearching(false), 200)} />
                  {isSearching && (
                    <div className="search-results-dropdown">
                      {filteredCustomers.length === 0 ? <div className="no-results">Ingen hittades...</div> : filteredCustomers.map(c => (<div key={c.id} className="search-result-item" onMouseDown={() => selectCustomer(c)}><span>{c.name}</span><span style={{fontSize:'0.8em', color:'#999'}}>{c.type}</span></div>))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="selected-customer-card">
                  <button className="change-customer-btn" onClick={() => setSelectedCustomer(null)}>Byt kund</button>
                  <h2 className="customer-card-name">{selectedCustomer.name}</h2>
                  <div className="customer-card-type">{selectedCustomer.type}</div>
                  <div className="customer-card-balance-row"><span>Skuld:</span><span className={selectedCustomer.currentBalance > 0 ? 'balance-negative' : 'balance-neutral'}>{selectedCustomer.currentBalance} kr</span></div>
                  {isKonfirmand(selectedCustomer) && <div className="limit-info">Maxgräns (V.{getCurrentCampWeek()}): {getCurrentCampWeek()*100} kr</div>}
                </div>
              )}
              {adminMode && <button className="manage-customers-btn" onClick={openCustomerManager}>👥 Hantera Kunder</button>}
            </div>

            <div className="cart-items">
              <div className="cart-header-title"><h3>Varukorg</h3>{cart.length > 0 && <span className="clear-cart-btn" onClick={clearCart}>RENSA</span>}</div>
              {cart.length === 0 && <p className="empty-cart-msg">Tom varukorg</p>}
              {cart.map(item => (
                <div key={item.product.id} className="cart-item">
                  <div className="cart-item-info"><span className="cart-item-name">{item.product.name}</span><span className="cart-item-price">{item.product.price} kr</span></div>
                  <div className="cart-controls"><button className="qty-btn" onClick={() => decreaseQuantity(item.product.id)}>−</button><span className="qty-display">{item.quantity}</span><button className="qty-btn" onClick={() => addToCart(item.product)}>+</button></div>
                </div>
              ))}
            </div>
            <div className="cart-footer">
              <div className="total-row"><span>Totalt:</span><span>{totalSum} kr</span></div>
              <button className="pay-button" onClick={initiatePurchase} disabled={!selectedCustomer || cart.length === 0 || isProcessing}>{isProcessing ? "BEARBETAR..." : "GENOMFÖR KÖP"}</button>
            </div>
          </div>

          <div className="product-area">
            <div className="product-header">
              <div className="logo-container"><img src="logo.png" alt="" className="app-logo" onError={(e) => e.target.style.display = 'none'} /><div className="app-title">PRÄSTBYRÅN</div></div>
              <button className="admin-lock-btn" onClick={toggleAdmin}>{adminMode?"🔓":"🔒"}</button>
            </div>
            <div className="category-tabs">{categories.map(cat => (<div key={cat} className={`category-tab ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>{cat}</div>))}</div>
            <div className="product-grid-container">
              <div className="product-grid">
                {adminMode && <div className="product-card add-product-card" onClick={()=>openProductModal(null)}>+</div>}
                {filteredProducts.map(product => (
                  <div key={product.id} className="product-card" onClick={() => addToCart(product)} style={{cursor: adminMode?'default':'pointer'}}>
                    <div className="product-name">{product.name}</div><div className="product-price">{product.price} kr</div>
                    {adminMode && (<div className="admin-controls"><button className="btn-admin-action btn-edit" onClick={(e)=>{e.stopPropagation();openProductModal(product)}}>✏️</button><button className="btn-admin-action btn-delete" onClick={(e)=>{e.stopPropagation();deleteProduct(product)}}>🗑️</button></div>)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App;