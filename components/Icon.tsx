interface IconProps {
  /** Nombre del ícono en el sprite SVG (sin el prefijo 'icon-') */
  name: string;
  /** Tamaño en píxeles (ancho y alto) */
  size?: number;
  /** Clases de Tailwind para estilos adicionales (ej. colores, márgenes) */
  className?: string;
  /** Texto accesible. Si se provee, el SVG se vuelve visible para lectores de pantalla. */
  label?: string;
}

export function Icon({ name, size = 16, className, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      aria-hidden={!label}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {/* Usamos una ruta absoluta para que funcione desde cualquier nivel de anidación */}
      <use href={`/icons.svg#icon-${name}`} />
    </svg>
  );
}