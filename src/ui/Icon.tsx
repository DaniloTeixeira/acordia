// Ícone do sprite SVG do index.html (#i-nome).
export function Icon({name, sm, className = ""}: {name: string; sm?: boolean; className?: string}){
  return <svg className={"i" + (sm ? " sm" : "") + (className ? " " + className : "")} aria-hidden="true"><use href={"#i-" + name}/></svg>;
}
