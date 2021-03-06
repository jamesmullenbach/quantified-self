import { Component, HostListener, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as Sentry from '@sentry/browser';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AppFileService } from '../../services/app.file.service';
import { combineLatest, of, Subscription } from 'rxjs';
import { AppEventService } from '../../services/app.event.service';
import { EventImporterFIT } from '@sports-alliance/sports-lib/lib/events/adapters/importers/fit/importer.fit';
import { AppAuthService } from '../../authentication/app.auth.service';
import { User } from '@sports-alliance/sports-lib/lib/users/user';
import { ActivatedRoute, Router } from '@angular/router';
import { AppUserService } from '../../services/app.user.service';
import { switchMap, take, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AngularFireAnalytics } from '@angular/fire/analytics';
import { UserServiceMetaInterface } from '@sports-alliance/sports-lib/lib/users/user.service.meta.interface';
import { AppWindowService } from '../../services/app.window.service';
import { Auth2ServiceTokenInterface } from '@sports-alliance/sports-lib/lib/service-tokens/oauth2-service-token.interface';
import { Auth1ServiceTokenInterface } from '@sports-alliance/sports-lib/lib/service-tokens/oauth1-service-token.interface';
import { ServiceNames } from '@sports-alliance/sports-lib/lib/meta-data/event-meta-data.interface';


@Component({
  selector: 'app-home',
  templateUrl: './services.component.html',
  styleUrls: ['./services.component.css'],
})
export class ServicesComponent implements OnInit, OnDestroy {
  public suuntoAppLinkFormGroup: FormGroup;
  public isLoading = false;
  public user: User;
  public isGuest: boolean;
  public suuntoAppTokens: Auth2ServiceTokenInterface[];
  public garminHealthAPIToken: Auth1ServiceTokenInterface;
  public suuntoAppMeta: UserServiceMetaInterface
  public selectedTabIndex = 0;
  public serviceNames = ServiceNames;

  private userSubscription: Subscription;

  @HostListener('window:tokensReceived', ['$event'])
  async tokensReceived(event) {
    await this.userService.setSuuntoAppToken(this.user, event.detail.serviceAuthResponse);
    this.isLoading = false;
    this.snackBar.open(`Connected successfully`, null, {
      duration: 2000,
    });
    this.afa.logEvent('connected_to_service', {serviceName: event.detail.serviceName});
  }
  @HostListener('window:authError', ['$event'])
  async authError(event) {
    this.isLoading = false;
    Sentry.captureException(new Error(`Could not connect to Suunto app. Please try another browser or allow popups and cross-site cookies form this site. ERROR: ${event.detail.error}`));
    this.snackBar.open(`Could not connect to Suunto app. Please try another browser or allow popups and cross-site cookies form this site. ERROR: ${event.detail.error}`, null, {
      duration: 10000,
    });
  }

  constructor(private http: HttpClient, private fileService: AppFileService,
              private afa: AngularFireAnalytics,
              private eventService: AppEventService,
              public authService: AppAuthService,
              private userService: AppUserService,
              private router: Router,
              private route: ActivatedRoute,
              private windowService: AppWindowService,
              private snackBar: MatSnackBar) {
  }

  async ngOnInit() {
    this.isLoading = true;
    this.userSubscription = this.authService.user.pipe(switchMap((user) => {
      this.user = user;
      if (!this.user) {
        this.snackBar.open('You must login if you want to use the service features', 'OK', {
          duration: null,
        });
        return of(null);
      }
      this.isGuest = this.authService.isGuest();
      if (this.isGuest) {
        this.snackBar.open('You must login with a non-guest account if you want to use the service features', 'OK', {
          duration: null,
        });
        return of(null);
      }
      return combineLatest([
        this.userService.getSuuntoAppToken(user),
        this.userService.getGarminHealthAPIToken(this.user),
        this.userService
          .getUserMetaForService(this.user, ServiceNames.SuuntoApp),
      ])
    })).pipe(tap((results) => {
      if (!results){
        this.suuntoAppTokens = null;
        this.garminHealthAPIToken = null;
        this.suuntoAppMeta = null;
        return;
      }
      this.suuntoAppTokens = results[0];
      this.garminHealthAPIToken = results[1];
      this.suuntoAppMeta = results[2];
    })).subscribe(async (results) => {
      const state = this.route.snapshot.queryParamMap.get('state');
      const oauthToken = this.route.snapshot.queryParamMap.get('oauth_token');
      const oauthVerifier = this.route.snapshot.queryParamMap.get('oauth_verifier');
      if (state && oauthToken && oauthVerifier) {
        try {
          // @todo fix view changed
          this.selectedTabIndex = 1;
          await this.userService.requestAndSetCurrentUserGarminAccessToken(state, oauthVerifier);
          this.afa.logEvent('connected_to_service', {serviceName: ServiceNames.GarminHealthAPI});
          this.snackBar.open('Successfully connected to Garmin Health API', null, {
            duration: 10000,
          })
        } catch (e) {
          Sentry.captureException(e);
        } finally {
          await this.router.navigate(['services'], {preserveQueryParams: false});
        }
      }
      this.isLoading = false;
    });
    this.suuntoAppLinkFormGroup = new FormGroup({
      input: new FormControl('', [
        Validators.required,
        // Validators.minLength(4),
      ]),
    });
  }

  @HostListener('window:resize', ['$event'])
  getColumnsToDisplayDependingOnScreenSize(event?) {
    return window.innerWidth < 600 ? 1 : 2;
  }


  hasError(field: string) {
    return !(this.suuntoAppLinkFormGroup.get(field).valid && this.suuntoAppLinkFormGroup.get(field).touched);
  }

  async onImportAndOpen() {
    return this.onSubmit(true);
  }

  async onSubmit(shouldImportAndOpen?: boolean) {
    if (!this.suuntoAppLinkFormGroup.valid) {
      this.validateAllFormFields(this.suuntoAppLinkFormGroup);
      return;
    }

    if (this.isLoading) {
      return false;
    }

    this.isLoading = true;

    try {

      const parts = this.suuntoAppLinkFormGroup.get('input').value.split('?')[0].split('/');
      const activityID = parts[parts.length - 1] === '' ? parts[parts.length - 2] : parts[parts.length - 1];

      const result = await this.http.get(
        environment.functions.stWorkoutDownloadAsFit, {
          params: {
            activityID: activityID
          },
          responseType: 'arraybuffer',
        }).toPromise();

      if (!shouldImportAndOpen) {
        this.fileService.downloadFile(new Blob([new Uint8Array(result)]), activityID, 'fit');
        // .subscribe(response => this.downLoadFile(response, "application/ms-excel"));
        this.snackBar.open('Activity download started', null, {
          duration: 2000,
        });
        this.afa.logEvent('downloaded_fit_file', {method: ServiceNames.SuuntoApp});
      } else {
        const newEvent = await EventImporterFIT.getFromArrayBuffer(result);
        await this.eventService.writeAllEventData(this.user, newEvent);
        this.afa.logEvent('imported_fit_file', {method: ServiceNames.SuuntoApp});
        await this.router.navigate(['/user', this.user.uid, 'event', newEvent.getID()], {});
      }
    } catch (e) {
      this.snackBar.open('Could not open activity. Make sure that the activity is public by opening the link in a new browser tab', null, {
        duration: 5000,
      });
      Sentry.captureException(e);
    } finally {
      this.isLoading = false;
    }
  }

  validateAllFormFields(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(field => {
      const control = formGroup.get(field);
      if (control instanceof FormControl) {
        control.markAsTouched({onlySelf: true});
      } else if (control instanceof FormGroup) {
        this.validateAllFormFields(control);
      }
    });
  }

  connectWithSuuntoApp(event) {
    this.isLoading = true;
    const wnd = window.open('assets/authPopup.html?signInWithService=false', 'name', 'height=585,width=400');
    if (!wnd || wnd.closed || typeof wnd.closed === 'undefined') {
      this.snackBar.open(`Popup has been block by your browser settings. Please disable popup blocking for this site to connect with the Suunto app`, null, {
        duration: 5000,
      });
      Sentry.captureException(new Error(`Could not open popup for signing in with the Suunto app`));
      return
    }
    // wnd.onunload = () => this.isLoading = false;
  }

  async connectWithGarmin(event) {
    try {
      this.isLoading = true;
      const tokenAndURI = await this.userService.getCurrentUserGarminHealthAPITokenAndRedirectURI();
      // Get the redirect url for the unsigned token created with the post
      this.windowService.windowRef.location.href = `${tokenAndURI.redirect_uri}?oauth_token=${tokenAndURI.oauthToken}&oauth_callback=${encodeURI(`${this.windowService.currentDomain}/services?state=${tokenAndURI.state}`)}`
    } catch (e){
      Sentry.captureException(e);
      this.snackBar.open(`Could not connect to Garmin Connect due to ${e.message}`, null, {
        duration: 5000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  async deauthorizeSuuntoApp(event) {
    this.isLoading = true;
    try {
      await this.userService.deauthorizeSuuntoApp();
      this.snackBar.open(`Disconnected successfully`, null, {
        duration: 2000,
      });
      this.afa.logEvent('disconnected_from_service', {serviceName: ServiceNames.SuuntoApp});
    } catch (e) {
      Sentry.captureException(e);
      this.snackBar.open(`Could not disconnect due to ${e.message}`, null, {
        duration: 2000,
      });
    }
    this.isLoading = false;
  }

  async deauthorizeGarminHealthAPI(event) {
    this.isLoading = true;
    try {
      await this.userService.deauthorizeGarminHealthAPI();
      this.garminHealthAPIToken = null
      this.snackBar.open(`Disconnected successfully`, null, {
        duration: 2000,
      });
      this.afa.logEvent('disconnected_from_service', {serviceName: ServiceNames.GarminHealthAPI});
    } catch (e) {
      Sentry.captureException(e);
      this.snackBar.open(`Could not disconnect due to ${e.message}`, null, {
        duration: 2000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }
}
