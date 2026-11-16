import type { FC } from 'react';
import './MaterialIcon.css';

interface MaterialIconProps {
  name: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  onClick?: () => void;
}

const MaterialIcon: FC<MaterialIconProps> = ({ 
  name, 
  size = 'medium',
  className = '',
  onClick 
}) => {
  return (
    <span 
      className={`material-icons material-icon material-icon--${size} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {name}
    </span>
  );
};

export default MaterialIcon;