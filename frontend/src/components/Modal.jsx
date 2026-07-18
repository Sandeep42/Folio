// Tauri's embedded webview doesn't reliably support window.prompt()/confirm()
// (same issue we hit with Clear Data), so anything needing user input or a
// blocking choice uses this in-app modal instead of a native JS dialog.
export default function Modal({ title, onClose, children }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 6,
          padding: 20, width: 360, maxWidth: '90vw', boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</h3>
          <button className="btn" style={{ padding: '2px 8px' }} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
