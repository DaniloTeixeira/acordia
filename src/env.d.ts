// Atributos que o React 18 repassa ao DOM, mas que os tipos ainda não conhecem.
import "react";
declare module "react" {
  interface HTMLAttributes<T> { popover?: "" | "auto" | "manual" }
}
