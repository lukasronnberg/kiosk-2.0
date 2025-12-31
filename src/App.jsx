import { useState, useEffect, useMemo, useRef } from 'react'
import { db } from './firebase'
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, increment, Timestamp } from 'firebase/firestore'
import './App.css'

const CAMP_START_DATE = new Date("2025-12-30"); 

function App() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [cart, setCart] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState("ALLA");
  const searchInputRef = useRef(null);

  // State för att hantera "Ny kategori" i modalen
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const [modal, setModal] = useState({ isOpen: false, type: 'confirm', title: '', message: '', data: null, onConfirm: null });

  useEffect(() => {
    fetchProducts();
    reloadCustomers();
  }, []);

  useEffect(() => {
    let timer;
    if (modal.isOpen && modal.type === 'success') {
      timer = setTimeout(() => closeModal(), 2000);
    }
    return () => clearTimeout(timer);
  }, [modal]);

  const fetchProducts = async () => {
    try {
      const prodSnap = await getDocs(collection(db, "products"));
      const prodList = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      prodList.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(prodList);
      setLoading(false);
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

  // --- KATEGORIER ---
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || "Övrigt"));
    return ["ALLA", ...Array.from(cats).sort()];
  }, [products]);

  // Lista för modalen (exkludera "ALLA")
  const availableCategories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || "Övrigt"));
    return Array.from(cats).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (activeCategory === "ALLA") return products;
    return products.filter(p => (p.category || "Övrigt") === activeCategory);
  }, [products, activeCategory]);

 // --- SÖK ---
  const filteredCustomers = useMemo(() => {
    // Om sökfältet är tomt, visa ALLA kunder (så man kan scrolla)
    if (!customerSearch) return customers;
    
    const lower = customerSearch.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(lower));
  }, [customerSearch, customers]);

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(""); 
    setIsSearching(false);
  };

  // --- CART ---
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

  // --- KÖP ---
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
        customerId: selectedCustomer.id, customerName: selectedCustomer.name,
        items: itemSummary, totalAmount: totalSum, timestamp: Timestamp.now(), week: week
      });
      await updateDoc(doc(db, "customers", selectedCustomer.id), {
        currentBalance: increment(totalSum), totalSpent: increment(totalSum)
      });
      setModal({ isOpen: true, type: 'success', title: 'KÖP KLART!', message: `Sparat ${totalSum} kr.`, onConfirm: null });
      setCart([]); setSelectedCustomer(null); await reloadCustomers();
    } catch (e) { showAlert("❌ Fel", "Databasfel."); } finally { setTimeout(() => setIsProcessing(false), 2000); }
  };

  // --- MODALS & ADMIN ---
  const toggleAdmin = () => setAdminMode(!adminMode);
  const closeModal = () => { setModal({ ...modal, isOpen: false }); setIsCreatingCategory(false); };
  const showAlert = (title, message, isError = false) => setModal({ isOpen: true, type: isError ? 'error' : 'success', title, message, onConfirm: closeModal });

  const openCustomerManager = () => setModal({ isOpen: true, type: 'manage-customers', title: 'Hantera Kunder' });
  const openCustomerEdit = (c=null) => setModal({ isOpen:true, type:'edit-customer', title: c?'Redigera':'Ny', data: c||{name:'',type:'Konfirmand',currentBalance:0}, onConfirm:(fd)=>saveCustomer(fd, c?.id) });
  
  const saveCustomer = async (fd, id) => { 
    try { 
      if(id) await updateDoc(doc(db,"customers",id),fd); 
      else await addDoc(collection(db,"customers"),{...fd, currentBalance:Number(fd.currentBalance)||0}); 
      closeModal(); reloadCustomers(); setTimeout(openCustomerManager,300); 
    } catch(e){alert("Fel");} 
  };
  
  const deleteCustomer = async (id, name) => { if(confirm("Radera " + name + "?")) { await deleteDoc(doc(db,"customers",id)); reloadCustomers(); }};

  // PRODUKTER & KATEGORIER
  const openProductModal = (p=null) => {
    setModal({ 
      isOpen:true, 
      type:'edit-product', 
      title: p?'Redigera':'Ny vara', 
      data: p||{name:'',price:'',category:'Övrigt'}, 
      onConfirm:(fd)=>saveProduct(fd, p?.id) 
    });
  };

  const saveProduct = async (fd, id) => { 
    try { 
      const p=parseInt(fd.price); 
      // Använd "newCategory" om man valt att skapa en ny, annars den vanliga
      const finalCategory = fd.category === 'NEW_CAT_OPTION' ? fd.newCategory : fd.category;
      
      if (!finalCategory) return alert("Ange en kategori!");

      if(id) await updateDoc(doc(db,"products",id),{name:fd.name,price:p,category:finalCategory}); 
      else await addDoc(collection(db,"products"),{name:fd.name,price:p,category:finalCategory}); 
      
      closeModal(); fetchProducts(); 
    } catch(e){alert("Fel");} 
  };

  const deleteProduct = async (p) => { if(confirm("Radera?")) { await deleteDoc(doc(db,"products",p.id)); fetchProducts(); }};
// Hantera Enter-tryck i sökfältet
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Förhindra standardbeteende
      // Om listan har träffar, välj den första direkt
      if (filteredCustomers.length > 0) {
        selectCustomer(filteredCustomers[0]);
      }
    }
  };

  // --- GLOBAL TANGENTBORDS-HANTERING ---
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // 1. ESCAPE: Stäng modal eller rensa kund/varukorg
      if (e.key === 'Escape') {
        if (modal.isOpen) {
          closeModal();
        } else {
          setSelectedCustomer(null);
          setCart([]);
          setCustomerSearch("");
          setIsSearching(false);
          // Ta bort fokus från input så man inte råkar skriva direkt igen
          if (document.activeElement === searchInputRef.current) {
            document.activeElement.blur();
          }
        }
        return; // Avsluta här om det var Escape
      }

      // 2. AUTO-FOKUS PÅ SÖKFÄLTET
      // Om man:
      // - Inte är i Admin-läge
      // - Inte har valt en kund än (sökfältet syns)
      // - Ingen modal är öppen
      // - Det är en bokstav/siffra (längd 1) och inte Ctrl/Alt-kommandon
      if (
        !adminMode && 
        !selectedCustomer && 
        !modal.isOpen && 
        e.key.length === 1 && 
        !e.ctrlKey && 
        !e.metaKey && 
        !e.altKey
      ) {
        // Om vi inte redan står i sökfältet -> Fokusera det!
        if (document.activeElement !== searchInputRef.current) {
          searchInputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [modal.isOpen, adminMode, selectedCustomer]); // Viktigt: Uppdatera lyssnaren om dessa ändras
  
  return (
    <div className={`app-container ${adminMode ? 'admin-active' : ''}`}>
      {adminMode && <div className="admin-mode-banner">🔧 ADMIN-LÄGE</div>}
      
      {modal.isOpen && (
        <div className="modal-overlay">
          <div className={`modal-box ${modal.type === 'success' ? 'success-mode' : ''}`}>
            {modal.type === 'success' && <div className="success-icon">✅</div>}
            <h2 className="modal-title">{modal.title}</h2>
            
            {/* MANAGE CUSTOMERS */}
            {modal.type === 'manage-customers' && (
               <div style={{textAlign:'left'}}>
                 <button className="btn-modal btn-confirm" style={{width:'100%', marginBottom:'10px'}} onClick={()=>openCustomerEdit()}>+ Ny Kund</button>
                 <div style={{maxHeight:'300px', overflowY:'auto'}}>
                   {customers.map(c => (
                     <div key={c.id} className="customer-list-row" style={{display:'flex',justifyContent:'space-between',padding:'10px',borderBottom:'1px solid #eee'}}>
                       <div><strong>{c.name}</strong><br/><span style={{fontSize:'0.8em'}}>{c.type}</span></div>
                       <div><button className="btn-admin-action btn-edit" onClick={()=>openCustomerEdit(c)}>✏️</button></div>
                     </div>
                   ))}
                 </div>
                 <div style={{textAlign:'center', marginTop:'10px'}}><button className="btn-modal btn-cancel" onClick={closeModal}>Stäng</button></div>
               </div>
            )}
            
            {/* EDIT CUSTOMER */}
            {modal.type === 'edit-customer' && (
               <div className="admin-form">
                 <label>Namn:</label><input id="cName" defaultValue={modal.data.name} />
                 <label>Typ:</label><select id="cType" defaultValue={modal.data.type}><option>Konfirmand</option><option>Hjon</option></select>
                 <label>Saldo:</label><input id="cBal" type="number" defaultValue={modal.data.currentBalance} />
                 <div className="modal-buttons"><button className="btn-modal btn-cancel" onClick={openCustomerManager}>Tillbaka</button><button className="btn-modal btn-confirm" onClick={()=>modal.onConfirm({name:document.getElementById('cName').value, type:document.getElementById('cType').value, currentBalance:document.getElementById('cBal').value})}>SPARA</button></div>
               </div>
            )}
            
            {/* EDIT PRODUCT & KATEGORI */}
            {modal.type === 'edit-product' && (
              <div className="admin-form">
                <label>Namn:</label>
                <input id="pName" defaultValue={modal.data.name} />
                <label>Pris (kr):</label>
                <input id="pPrice" type="number" defaultValue={modal.data.price} />
                
                <label>Kategori:</label>
                <select 
                  id="pCat" 
                  defaultValue={modal.data.category || 'Övrigt'} 
                  onChange={(e) => setIsCreatingCategory(e.target.value === 'NEW_CAT_OPTION')}
                >
                  {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  <option disabled>──────────</option>
                  <option value="NEW_CAT_OPTION">+ SKAPA NY KATEGORI...</option>
                </select>

                {/* Visa extra fält om man valde "Skapa ny" */}
                {isCreatingCategory && (
                  <input id="pNewCat" placeholder="Skriv namn på ny kategori..." autoFocus style={{borderColor:'#f39c12'}} />
                )}

                <div className="modal-buttons">
                  <button className="btn-modal btn-cancel" onClick={closeModal}>Avbryt</button>
                  <button className="btn-modal btn-confirm" onClick={() => {
                     modal.onConfirm({
                       name: document.getElementById('pName').value, 
                       price: document.getElementById('pPrice').value,
                       category: document.getElementById('pCat').value,
                       newCategory: isCreatingCategory ? document.getElementById('pNewCat').value : null
                     })
                  }}>SPARA</button>
                </div>
              </div>
            )}

            {(modal.type === 'confirm' || modal.type === 'error' || modal.type === 'success') && (
              <>
                <p className="modal-message" style={{whiteSpace:'pre-line'}}>{modal.message}</p>
                <div className="modal-buttons">
                  {modal.type === 'confirm' && <><button className="btn-modal btn-cancel" onClick={closeModal}>AVBRYT</button><button className="btn-modal btn-confirm" onClick={modal.onConfirm}>JA, KÖP</button></>}
                  {modal.type === 'error' && <button className="btn-modal btn-cancel" onClick={closeModal}>OK</button>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* --- SIDEBAR --- */}
      <div className="cart-sidebar">
        <div className="cart-header">
          {!selectedCustomer ? (
            <div className="customer-search-container">
              <h2 style={{marginBottom:'10px'}}>Välj Kund</h2>
              <input 
                type="text" 
                className="search-input" 
                placeholder="🔍 Sök eller välj i listan..." 
                value={customerSearch}
                ref={searchInputRef}
                onKeyDown={handleSearchKeyDown}
                onChange={(e) => { setCustomerSearch(e.target.value); setIsSearching(true); }}
                onFocus={() => setIsSearching(true)}
                // Liten fördröjning på onBlur så man hinner klicka på listan innan den stängs
                onBlur={() => setTimeout(() => setIsSearching(false), 200)} 
              />
              
              {/* Visa listan om isSearching är true (oavsett om man skrivit något eller ej) */}
              {isSearching && (
                <div className="search-results-dropdown">
                  {filteredCustomers.length === 0 ? (
                    <div style={{padding:'15px', color:'#999'}}>Ingen hittades...</div> 
                  ) : (
                    filteredCustomers.map(c => (
                      <div key={c.id} className="search-result-item" onMouseDown={() => selectCustomer(c)}>
                        <span>{c.name}</span>
                        <span style={{fontSize:'0.8em', color:'#999'}}>{c.type}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="selected-customer-card">
              <button className="change-customer-btn" onClick={() => setSelectedCustomer(null)}>Byt kund</button>
              <h2 style={{fontSize:'1.3rem', marginBottom:'5px'}}>{selectedCustomer.name}</h2>
              <div style={{fontSize:'0.9rem', opacity:0.9, marginBottom:'5px'}}>{selectedCustomer.type}</div>
              <div style={{display:'flex', justifyContent:'space-between', marginTop:'10px', fontSize:'1.1rem', fontWeight:'bold'}}>
                <span>Skuld:</span><span style={{color: selectedCustomer.currentBalance > 0 ? '#ffcccb' : 'white'}}>{selectedCustomer.currentBalance} kr</span>
              </div>
              {isKonfirmand(selectedCustomer) && <div style={{fontSize:'0.8rem', marginTop:'5px', opacity:0.8}}>Maxgräns (V.{getCurrentCampWeek()}): {getCurrentCampWeek()*100} kr</div>}
            </div>
          )}
          {adminMode && <button className="manage-customers-btn" onClick={openCustomerManager}>👥 Hantera Kunder</button>}
        </div>

        <div className="cart-items">
          <div className="cart-header-title">
             <h3>Varukorg</h3>
             {cart.length > 0 && <span onClick={clearCart} style={{fontSize:'0.8em', color:'#e74c3c', cursor:'pointer', fontWeight:'bold'}}>RENSA</span>}
          </div>
          {cart.length === 0 && <p style={{color:'#ccc', textAlign:'center', marginTop:'40px', fontSize:'0.9rem'}}>Tom varukorg</p>}
          {cart.map(item => (
            <div key={item.product.id} className="cart-item">
              <div className="cart-item-info">
                <span className="cart-item-name">{item.product.name}</span>
                <span className="cart-item-price">{item.product.price} kr</span>
              </div>
              <div className="cart-controls">
                <button className="qty-btn" onClick={() => decreaseQuantity(item.product.id)}>−</button>
                <span className="qty-display">{item.quantity}</span>
                <button className="qty-btn" onClick={() => addToCart(item.product)}>+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="cart-footer">
          <div className="total-row"><span>Totalt:</span><span>{totalSum} kr</span></div>
          <button className="pay-button" onClick={initiatePurchase} disabled={!selectedCustomer || cart.length === 0 || isProcessing}>
            {isProcessing ? "BEARBETAR..." : "GENOMFÖR KÖP"}
          </button>
        </div>
      </div>

      {/* --- PRODUKTER --- */}
      <div className="product-area">
        <div className="product-header">
          <div className="logo-container">
            <img src="/logo.png" alt="" className="app-logo" onError={(e) => e.target.style.display = 'none'} />
            <div className="app-title">PRÄSTBYRÅN</div>
          </div>
          <button className="admin-lock-btn" onClick={toggleAdmin}>{adminMode?"🔓":"🔒"}</button>
        </div>
        
        <div className="category-tabs">
          {categories.map(cat => (
            <div key={cat} className={`category-tab ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
              {cat}
            </div>
          ))}
        </div>

        <div className="product-grid-container">
          <div className="product-grid">
            {adminMode && <div className="product-card add-product-card" onClick={()=>openProductModal(null)}>+</div>}
            
            {filteredProducts.map(product => (
              <div key={product.id} className="product-card" onClick={() => addToCart(product)} style={{cursor: adminMode?'default':'pointer'}}>
                <div className="product-name">{product.name}</div>
                <div className="product-price">{product.price} kr</div>
                {adminMode && (
                  <div className="admin-controls">
                    <button className="btn-admin-action btn-edit" onClick={(e)=>{e.stopPropagation();openProductModal(product)}}>✏️</button>
                    <button className="btn-admin-action btn-delete" onClick={(e)=>{e.stopPropagation();deleteProduct(product)}}>🗑️</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App