import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Film } from "lucide-react";

interface CreditConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remainingCredits: number;
  onConfirm: () => void;
  isPending?: boolean;
}

const CreditConfirmModal = ({ open, onOpenChange, remainingCredits, onConfirm, isPending }: CreditConfirmModalProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent className="max-w-sm">
      <AlertDialogHeader>
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
          <Film className="w-6 h-6 text-primary" />
        </div>
        <AlertDialogTitle className="text-center">Generar Video Final</AlertDialogTitle>
        <AlertDialogDescription className="text-center space-y-2">
          <p>Esto usará <span className="font-semibold text-foreground">1 crédito</span>.</p>
          <p>Tenés <span className="font-semibold text-foreground">{remainingCredits}</span> créditos restantes.</p>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="sm:justify-center gap-2">
        <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} disabled={isPending || remainingCredits < 1}>
          Generar Video
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default CreditConfirmModal;
