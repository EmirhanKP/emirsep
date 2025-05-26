import { Component, OnInit, OnDestroy } from '@angular/core'; // OnDestroy hinzugefügt
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, of, Subject, Subscription } from 'rxjs'; // Subject, Subscription hinzugefügt
import { catchError, tap, map, takeUntil, finalize } from 'rxjs/operators'; // takeUntil, finalize hinzugefügt

import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { UserProfile } from '../../models/user-profile.model';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CurrencyPipe
  ],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss']
})
export class AccountComponent implements OnInit, OnDestroy {

  // Subject zum Beenden von Subscriptions bei Zerstörung der Komponente
  private destroy$ = new Subject<void>();

  // currentUserProfile$: Observable<UserProfile | null>; // Wird direkt abonniert
  userProfile: UserProfile | null = null; // Direkte Haltung des Profils
  accountBalance: number | null = null;

  depositForm: FormGroup;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  isLoadingProfile: boolean = true; // Für das Laden des Gesamtprofils
  isLoadingBalanceManual: boolean = false; // Für manuelles Neuladen des Kontostands
  isDepositing: boolean = false;
  currentUserId: number | null = null;

  constructor(
    private userService: UserService,
    private authService: AuthService, // Wird aktuell nicht direkt verwendet, aber ggf. für User-ID
    private fb: FormBuilder
  ) {
    this.depositForm = this.fb.group({
      amount: [null, [Validators.required, Validators.min(0.01)]]
    });
  }

  ngOnInit(): void {
    console.log('AccountComponent ngOnInit aufgerufen');
    this.isLoadingProfile = true;
    this.errorMessage = null;

    this.userService.currentUserProfile$.pipe(
      takeUntil(this.destroy$) // Subscription beenden, wenn Komponente zerstört wird
    ).subscribe(profile => {
      console.log('currentUserProfile$ in AccountComponent empfangen:', profile);
      this.userProfile = profile;
      if (profile && profile.id) {
        this.currentUserId = profile.id;
        if (profile.accountBalance !== undefined && profile.accountBalance !== null) {
          console.log('Kontostand aus UserProfile-Stream genommen:', profile.accountBalance);
          this.accountBalance = profile.accountBalance;
          this.isLoadingProfile = false; // Profil und initialer Kontostand sind da
        } else {
          // Wenn accountBalance nicht im Profil ist, explizit laden
          console.log('accountBalance nicht im Profil vorhanden, lade manuell...');
          this.loadAccountBalanceManually(profile.id);
        }
      } else if (this.authService.isLoggedIn() && !profile) {
        // Fallback, wenn BehaviorSubject noch null ist, aber User eingeloggt ist
        console.log('BehaviorSubject ist null, aber User eingeloggt. Lade Profil via getMyProfile...');
        this.userService.getMyProfile().pipe(takeUntil(this.destroy$)).subscribe({
          next: freshProfile => {
            // Der userService sollte den BehaviorSubject bereits aktualisiert haben,
            // sodass dieser äußere Subscriber das frische Profil erhalten sollte.
            // Falls nicht, hier nochmal setzen: this.userProfile = freshProfile;
            if (!freshProfile || !freshProfile.id) {
                 this.errorMessage = "Profil konnte nicht vollständig geladen werden.";
                 this.isLoadingProfile = false;
            }
            // Die Logik oben im äußeren Subscriber sollte dann greifen.
          },
          error: err => {
            this.errorMessage = 'Fehler beim initialen Laden des Profils.';
            this.isLoadingProfile = false;
            console.error(err);
          }
        });
      } else if (!this.authService.isLoggedIn()){
        this.errorMessage = 'Bitte einloggen, um Kontoinformationen anzuzeigen.';
        this.isLoadingProfile = false;
      } else {
        // Profil ist null, User nicht eingeloggt oder anderer undefinierter Zustand
        this.isLoadingProfile = false;
         if (!this.errorMessage) this.errorMessage = 'Kontoinformationen nicht verfügbar.';
        console.log('Profil ist null oder keine User ID, isLoadingProfile auf false.');
      }
    });
  }

  // Separate Methode für explizites Neuladen des Kontostands (z.B. per Button)
  loadAccountBalanceManually(userId: number): void {
    if (!userId) return;
    console.log('loadAccountBalanceManually aufgerufen für User ID:', userId);
    this.isLoadingBalanceManual = true;
    this.errorMessage = null;
    this.userService.getAccountBalance(userId).pipe(
      map(response => {
        console.log('Antwort von getAccountBalance Service (manuell):', response);
        if (typeof response?.balance === 'number') {
          return response.balance;
        }
        throw new Error('Ungültige Kontostandsdaten empfangen');
      }),
      finalize(() => {
        this.isLoadingBalanceManual = false;
        console.log('loadAccountBalanceManually abgeschlossen.');
      })
    ).subscribe({
      next: balance => {
        this.accountBalance = balance;
        // Wenn das Hauptprofil-Objekt aktualisiert werden soll, hier Logik einfügen
        // (z.B. wenn UserService das nicht automatisch macht)
        if(this.userProfile) {
            this.userProfile.accountBalance = balance;
            // Informiere andere Teile der App, falls nötig:
            // this.userService.updateCurrentUserProfile(this.userProfile);
        }
      },
      error: err => {
        this.errorMessage = 'Kontostand konnte nicht neu geladen werden.';
        console.error('Error in loadAccountBalanceManually:', err);
        this.accountBalance = null;
      }
    });
  }

  onDeposit(): void {
    if (this.depositForm.invalid) {
      this.errorMessage = 'Bitte geben Sie einen gültigen Betrag ein.';
      this.depositForm.markAllAsTouched();
      return;
    }
    if (!this.currentUserId) {
      this.errorMessage = 'Benutzer-ID nicht gefunden. Bitte neu einloggen.';
      return;
    }

    this.isDepositing = true;
    this.errorMessage = null;
    this.successMessage = null;
    const amount = this.depositForm.value.amount;

    this.userService.addFunds(this.currentUserId, amount).pipe(
      finalize(() => {
        this.isDepositing = false;
      })
    ).subscribe({
      next: (updatedProfile) => {
        this.successMessage = `Erfolgreich ${amount.toFixed(2)} € eingezahlt.`;
        // `addFunds` im Service sollte `currentUserProfileSubject` aktualisieren,
        // wodurch der `ngOnInit` Subscriber das neue Profil inkl. Kontostand erhält.
        // Das `this.accountBalance` wird dann dort gesetzt.
        this.depositForm.reset();
        setTimeout(() => this.successMessage = null, 5000);
      },
      error: (err) => {
        this.errorMessage = err.error?.message || err.message || 'Einzahlung fehlgeschlagen.';
        console.error('Error in onDeposit:', err);
        setTimeout(() => this.errorMessage = null, 7000);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
