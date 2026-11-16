import type { FC } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import './TableSlide.css';

interface TableColumn {
  header: string;
  highlight?: boolean;
}

interface TableRow {
  label: string;
  values: string[];
}

interface TableSlideProps extends BaseSlideProps {
  label?: string;
  title: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: TableRow[];
}

const TableSlide: FC<TableSlideProps> = ({
  orientation = 'landscape',
  label,
  title,
  subtitle,
  columns,
  rows
}) => {
  // Portrait mode renders as a list of cards instead of a table
  if (orientation === 'portrait') {
    return (
      <div className="table-slide table-slide--portrait">
        <SlideHeader orientation={orientation} label={label} title={title} subtitle={subtitle} />
        <div className="table-slide__list">
          {columns.map((col, colIndex) => (
            <div
              key={colIndex}
              className={`table-slide__list-item ${col.highlight ? 'table-slide__list-item--highlight' : ''} animate-fade-in`}
              style={{ animationDelay: `${150 + colIndex * 60}ms` }}
            >
              <div className="table-slide__list-item-header">{col.header}</div>
              <div className="table-slide__list-item-details">
                {rows.map((row, rowIndex) => (
                  <div key={rowIndex} className="table-slide__list-item-row">
                    <span className="table-slide__list-item-label">{row.label}:</span>
                    <span className="table-slide__list-item-value">{row.values[colIndex]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="table-slide table-slide--landscape">
      <SlideHeader orientation={orientation} label={label} title={title} subtitle={subtitle} />
      <div className="table-slide__table-container">
        <table className="table-slide__table">
          <thead>
            <tr>
              <th className="table-slide__header-cell table-slide__label-cell">Factor</th>
              {columns.map((col, index) => (
                <th
                  key={index}
                  className={`table-slide__header-cell ${col.highlight ? 'table-slide__header-cell--highlight' : ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="table-slide__row animate-fade-in" style={{ animationDelay: `${150 + rowIndex * 60}ms` }}>
                <td className="table-slide__cell table-slide__label-cell">{row.label}</td>
                {row.values.map((value, colIndex) => (
                  <td
                    key={colIndex}
                    className={`table-slide__cell ${columns[colIndex]?.highlight ? 'table-slide__cell--highlight' : ''}`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TableSlide;
