export default function Legend() {
  return (
    <div id="legend" aria-label="Légende">
      <div className="legend-item">
        <span className="legend-tile" data-state="correct" />
        <span>Bonne place</span>
      </div>
      <div className="legend-item">
        <span className="legend-tile" data-state="present" />
        <span>Mauvaise place</span>
      </div>
      <div className="legend-item">
        <span className="legend-tile" data-state="absent" />
        <span>Absente</span>
      </div>
    </div>
  );
}
