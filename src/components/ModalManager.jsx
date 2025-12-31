import { useState, useEffect, useRef, useMemo } from 'react';
import './ModalManager.css';

const ModalManager = ({ 
  modal, 
  close, 
  actions, 
  customers, 
  products 
}) => {
  const [formData, setFormData] = useState({});
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const inputRef = useRef(null);

  // Auto-close success messages
  // ÄNDRAT: Från 2500 till 1200ms (Mycket snabbare!)
  useEffect(() => {
    let timer;
    if (modal.isOpen && modal.type === 'success') {
      timer = setTimeout(() => close(), 1200);
    }
    return () => clearTimeout(timer);
  }, [modal, close]);

  // Fokusera input vid öppning
  useEffect(() => {
    if (modal.isOpen) {
      if (modal.type === 'edit-customer') {
        setFormData(modal.data || { name: '', type: 'Konfirmand', currentBalance: 0, email: '' });
      } else if (modal.type === 'edit-product') {
        setFormData(modal.data || { name: '', price: '', category: 'Övrigt' });
        setIsCreatingCategory(false);
      }
      // Fokusera
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [modal.isOpen, modal.type, modal.data]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || "Övrigt"));
    return Array.from(cats).sort();
  }, [products]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Hantera Enter för de små input-fönstren (Betalning)
  const handleSimpleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputRef.current && modal.onConfirm) {
        modal.onConfirm(inputRef.current.value);
      }
    }
  };

  if (!modal.isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className={`modal-box ${modal.type === 'success' ? 'success-mode' : ''}`}>
        
        {/* --- SUCCESS / ERROR / CONFIRM --- */}
        {(modal.type === 'success' || modal.type === 'error' || modal.type === 'confirm' || modal.type === 'confirm-mass-email') && (
          <>
            {modal.type === 'success' && <div className="success-icon">✅</div>}
            <h2 className="modal-title">{modal.title}</h2>
            <p className="modal-message">{modal.message}</p>
            
            <div className="modal-buttons">
              {(modal.type.includes('confirm')) && (
                <button className="btn-modal btn-cancel" onClick={close}>AVBRYT</button>
              )}
              
              {(modal.type !== 'success') && (
                <button 
                  className="btn-modal btn-confirm" 
                  onClick={modal.type === 'error' ? close : modal.onConfirm}
                  autoFocus
                >
                  {modal.type === 'error' ? 'OK' : 'JA, FORTSÄTT'}
                </button>
              )}
            </div>
          </>
        )}

        {/* --- REGISTER / UNDO PAYMENT (Input value) --- */}
        {(modal.type === 'register-payment' || modal.type === 'undo-payment') && (
          <div>
            <h2 className="modal-title">{modal.title}</h2>
            <p className="modal-message">{modal.message}</p>
            <input 
              ref={inputRef}
              type="number" 
              defaultValue={modal.inputValue} 
              className="admin-form input"
              style={{fontSize: '1.5rem', textAlign: 'center', width: '100%', marginBottom: '20px'}}
              onKeyDown={handleSimpleInputKeyDown}
            />
            <div className="modal-buttons">
              <button className="btn-modal btn-cancel" onClick={close}>AVBRYT</button>
              <button 
                className="btn-modal btn-confirm" 
                onClick={() => modal.onConfirm(inputRef.current.value)}
              >
                {modal.type === 'register-payment' ? 'BEKRÄFTA' : 'ÅTERSTÄLL'}
              </button>
            </div>
          </div>
        )}

        {/* --- MANAGE CUSTOMERS --- */}
        {modal.type === 'manage-customers' && (
           <div>
             <h2 className="modal-title">{modal.title}</h2>
             <button 
                className="btn-modal btn-confirm btn-full-width" 
                onClick={() => actions.openEditCustomer()}
             >
               + Ny Kund
             </button>
             
             <div className="admin-list-container">
               {customers.map(c => (
                 <div key={c.id} className="customer-list-row">
                   <div className="customer-row-info">
                     <strong>{c.name}</strong><br/>
                     <span className="customer-row-type">{c.type}</span>
                   </div>
                   <div>
                     <button className="btn-admin-action btn-edit" onClick={() => actions.openEditCustomer(c)}>✏️</button>
                   </div>
                 </div>
               ))}
             </div>
             <div className="modal-close-container">
               <button className="btn-modal btn-cancel" onClick={close}>Stäng</button>
             </div>
           </div>
        )}

        {/* --- EDIT CUSTOMER FORM --- */}
        {modal.type === 'edit-customer' && (
           <div className="admin-form">
             <h2 className="modal-title">{modal.title}</h2>
             <label>Namn:</label>
             <input 
                ref={inputRef}
                value={formData.name || ''} 
                onChange={(e) => handleInputChange('name', e.target.value)} 
             />
             <label>Typ:</label>
             <select value={formData.type || 'Konfirmand'} onChange={(e) => handleInputChange('type', e.target.value)}>
                <option>Konfirmand</option>
                <option>Hjon</option>
             </select>
             <label>Saldo:</label>
             <input 
                type="number" 
                value={formData.currentBalance || 0} 
                onChange={(e) => handleInputChange('currentBalance', e.target.value)} 
             />
             <label>E-post:</label>
             <input 
                type="email" 
                value={formData.email || ''} 
                onChange={(e) => handleInputChange('email', e.target.value)} 
                placeholder="exempel@mail.se" 
             />
             <div className="modal-buttons">
                <button className="btn-modal btn-cancel" onClick={() => actions.openManageCustomers()}>Tillbaka</button>
                <button className="btn-modal btn-confirm" onClick={() => actions.saveCustomer(formData, modal.data?.id)}>SPARA</button>
             </div>
           </div>
        )}

        {/* --- EDIT PRODUCT FORM --- */}
        {modal.type === 'edit-product' && (
          <div className="admin-form">
            <h2 className="modal-title">{modal.title}</h2>
            <label>Namn:</label>
            <input 
                ref={inputRef}
                value={formData.name || ''} 
                onChange={(e) => handleInputChange('name', e.target.value)} 
             />
            <label>Pris (kr):</label>
            <input 
                type="number" 
                value={formData.price || ''} 
                onChange={(e) => handleInputChange('price', e.target.value)} 
            />
            <label>Kategori:</label>
            <select 
                value={formData.category || 'Övrigt'} 
                onChange={(e) => { 
                    handleInputChange('category', e.target.value); 
                    setIsCreatingCategory(e.target.value === 'NEW_CAT_OPTION'); 
                }}
            >
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              <option disabled>──────────</option>
              <option value="NEW_CAT_OPTION">+ SKAPA NY KATEGORI...</option>
            </select>
            {isCreatingCategory && (
                <input 
                    className="new-cat-input" 
                    placeholder="Skriv namn på ny kategori..." 
                    value={formData.newCategory || ''} 
                    onChange={(e) => handleInputChange('newCategory', e.target.value)} 
                />
            )}
            <div className="modal-buttons">
                <button className="btn-modal btn-cancel" onClick={close}>Avbryt</button>
                <button className="btn-modal btn-confirm" onClick={() => actions.saveProduct(formData, modal.data?.id)}>SPARA</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ModalManager;