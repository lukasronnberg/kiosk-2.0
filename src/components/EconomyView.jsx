import { useMemo } from 'react';
import './EconomyView.css';

const TEST_EMAIL_OVERRIDE = import.meta.env.VITE_TEST_EMAIL_OVERRIDE || "lukas.e.e.ronnberg@gmail.com";

const EconomyView = ({ 
  customers, 
  onEmailAll, 
  onOpenPayment, 
  onUndoPayment, 
  isProcessing 
}) => {

  // Filtrera fram de som har skuld
  const debtors = useMemo(() => {
    return customers
      .filter(c => c.currentBalance > 0)
      .sort((a, b) => b.currentBalance - a.currentBalance);
  }, [customers]);

  // Filtrera fram de som betalat klart (men handlat tidigare)
  const paidCustomers = useMemo(() => {
    return customers
      .filter(c => c.currentBalance <= 0 && c.totalSpent > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers]);

  return (
    <div className="economy-view">
      <div className="economy-container">
        
        {/* HEADER & MASS-ACTIONS */}
        <div className="economy-header-row">
            <div>
                <h1>💰 Skulder & Fakturering</h1>
                <p style={{marginBottom:0, color:'#666'}}>
                  All mailtrafik går just nu till: <strong>{TEST_EMAIL_OVERRIDE}</strong>
                </p>
            </div>
            <div style={{display:'flex', gap:'10px'}}>
                <button 
                  className="btn-action btn-email" 
                  onClick={() => onEmailAll('invoice')} 
                  disabled={isProcessing}
                >
                   📄 Fakturera Alla
                </button>
                <button 
                  className="btn-action btn-reminder" 
                  onClick={() => onEmailAll('reminder')} 
                  disabled={isProcessing}
                >
                   🔔 Påminn Alla
                </button>
            </div>
        </div>

        {/* LISTA: SKULDER */}
        <h3 className="section-title">🛑 Aktuella Skulder ({debtors.length} st)</h3>
        <div className="debt-list">
          <div className="debt-header">
            <span>Namn</span>
            <span>Skuld</span>
            <span>E-post</span>
            <span>Åtgärd</span>
          </div>
          
          {debtors.length === 0 && (
            <div style={{padding:'20px', textAlign:'center', color:'#aaa'}}>
              Inga skulder just nu! 🎉
            </div>
          )}

          {debtors.map(c => (
            <div key={c.id} className="debt-row">
              <div>
                <strong>{c.name}</strong><br/>
                <span style={{fontSize:'0.8em', color:'#888'}}>{c.type}</span>
              </div>
              <span style={{color:'#e74c3c', fontWeight:'bold', fontSize:'1.1rem'}}>
                {c.currentBalance} kr
              </span>
              <span style={{fontSize:'0.8rem', color: c.email ? '#333':'#ccc'}}>
                {c.email || '(Saknas)'}
              </span>
              <div className="debt-actions">
                <button 
                  className="btn-action btn-register-payment" 
                  onClick={() => onOpenPayment(c)} 
                  title="Registrera betalning"
                >
                    💸 Registrera Betalning
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* LISTA: AVSLUTADE */}
        <h3 className="section-title" style={{marginTop:'40px', color:'#27ae60'}}>
          ✅ Avslutade / Nollade ({paidCustomers.length} st)
        </h3>
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
                         <button 
                           className="btn-action btn-undo" 
                           onClick={() => onUndoPayment(c)}
                         >
                           ↩️ Ångra (Lägg till skuld)
                         </button>
                    </div>
                </div>
            ))}
        </div>

      </div>
    </div>
  );
};

export default EconomyView;