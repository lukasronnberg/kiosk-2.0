import { useState, useMemo, useRef, useEffect } from 'react';
import './Sidebar.css';

// Enligt din instruktion:
const CAMP_START_DATE = new Date(import.meta.env.VITE_CAMP_START_DATE || "2025-12-30");

const Sidebar = ({ 
  cart, 
  totalSum, 
  customers, 
  selectedCustomer, 
  onSelectCustomer, 
  onUpdateCart, 
  onCheckout, 
  onManageCustomers,
  adminMode,
  isProcessing
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);

  // --- 1. LOGIK FÖR ATT VISA KUNDER ---
  // Om sökfältet är tomt, visa ALLA kunder (så man ser listan vid klick)
  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers; 
    const lower = searchTerm.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(lower));
  }, [searchTerm, customers]);

  // Räkna ut vecka för maxgräns
  const getCurrentCampWeek = () => {
    const today = new Date();
    if (today < CAMP_START_DATE) return 1;
    const diffTime = Math.abs(today - CAMP_START_DATE);
    const week = Math.ceil(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) / 7);
    return week > 0 ? week : 1;
  };

  const isKonfirmand = (c) => c && c.type && c.type.toLowerCase().trim() === "konfirmand";
  const currentWeek = getCurrentCampWeek();

  const handleSelect = (customer) => {
    onSelectCustomer(customer);
    setSearchTerm("");
    setIsSearching(false);
  };

  // --- 2. TANGENTBORDS-MAGI (Global Fokus) ---
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Om admin-läge är på eller vi redan har en vald kund, gör inget
      if (adminMode || selectedCustomer) return;

      // Om vi redan står i input-fältet, gör inget (annars loopar det)
      if (document.activeElement === searchInputRef.current) return;

      // Ignorera specialtangenter (Ctrl, Alt, Meta, F-tangenter osv)
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length > 1) return;

      // Om det är en bokstav/siffra -> Fokusera sökfältet
      searchInputRef.current?.focus();
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [adminMode, selectedCustomer]);


  // --- 3. HANTERA "ENTER" I SÖKFÄLTET ---
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Välj första träffen i listan om den finns
      if (filteredCustomers.length > 0) {
        handleSelect(filteredCustomers[0]);
        // Tappa fokus så man kan scanna varor direkt
        searchInputRef.current?.blur(); 
      }
    }
  };

  return (
    <div className="cart-sidebar">
      {/* HEADER: KUNDVAL */}
      <div className="cart-header">
        {!selectedCustomer ? (
          <div className="customer-search-container">
            <h2 className="search-title">Välj Kund</h2>
            <input 
              ref={searchInputRef}
              type="text" 
              className="search-input" 
              placeholder="🔍 Sök eller välj..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setIsSearching(true); }}
              onKeyDown={handleInputKeyDown} // <--- Här lade vi till Enter-stödet
              onFocus={() => setIsSearching(true)}
              // Liten fördröjning vid blur så man hinner klicka på listan
              onBlur={() => setTimeout(() => setIsSearching(false), 200)}
            />
            
            {/* Visa listan om man söker ELLER om man klickat i rutan (isSearching) */}
            {isSearching && (
              <div className="search-results-dropdown">
                {filteredCustomers.length === 0 ? 
                  <div className="no-results">Ingen hittades...</div> : 
                  filteredCustomers.map(c => (
                    <div key={c.id} className="search-result-item" onMouseDown={() => handleSelect(c)}>
                      <span>{c.name}</span>
                      <span style={{fontSize:'0.8em', color:'#999'}}>{c.type}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        ) : (
          <div className="selected-customer-card">
            <button className="change-customer-btn" onClick={() => onSelectCustomer(null)}>Byt kund</button>
            <h2 className="customer-card-name">{selectedCustomer.name}</h2>
            <div style={{opacity:0.9, fontSize:'0.9rem'}}>{selectedCustomer.type}</div>
            
            <div className="customer-card-balance-row">
              <span>Skuld:</span>
              <span className={selectedCustomer.currentBalance > 0 ? 'balance-negative' : 'balance-neutral'}>
                {selectedCustomer.currentBalance} kr
              </span>
            </div>
            
            {isKonfirmand(selectedCustomer) && (
              <div style={{fontSize: '0.8rem', marginTop: '5px', opacity: 0.8}}>
                Maxgräns (V.{currentWeek}): {currentWeek * 100} kr
              </div>
            )}
          </div>
        )}
        
        {adminMode && (
          <button className="manage-customers-btn" onClick={onManageCustomers}>
            👥 Hantera Kunder
          </button>
        )}
      </div>

      {/* VARUKORG */}
      <div className="cart-items">
        <div className="cart-header-title">
          <h3>Varukorg</h3>
          {cart.length > 0 && (
            <span className="clear-cart-btn" onClick={() => onUpdateCart(null, 'clear')}>RENSA</span>
          )}
        </div>
        
        {cart.length === 0 && <p style={{color:'#ccc', textAlign:'center', marginTop:'40px'}}>Tom varukorg</p>}
        
        {cart.map(item => (
          <div key={item.product.id} className="cart-item">
            <div style={{display:'flex', flexDirection:'column'}}>
              <span style={{fontWeight:'700'}}>{item.product.name}</span>
              <span style={{fontSize:'0.9rem', color:'#666'}}>{item.product.price} kr</span>
            </div>
            <div className="cart-controls">
              <button className="qty-btn" onClick={() => onUpdateCart(item.product, 'decrease')}>−</button>
              <span className="qty-display">{item.quantity}</span>
              <button className="qty-btn" onClick={() => onUpdateCart(item.product, 'add')}>+</button>
            </div>
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <div className="cart-footer">
        <div className="total-row"><span>Totalt:</span><span>{totalSum} kr</span></div>
        <button 
          className="pay-button" 
          onClick={onCheckout} 
          disabled={!selectedCustomer || cart.length === 0 || isProcessing}
        >
          {isProcessing ? "BEARBETAR..." : "GENOMFÖR KÖP"}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;