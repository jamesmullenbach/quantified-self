import {Injectable} from '@angular/core';
import {MapsAPILoader} from '@agm/core';
import {GeoLocationInfo} from '../../entities/geo-location-info/app.geo-location-info';
import {GeoLocationInfoLocalStorageService} from '../storage/app.geo-location-info.local.storage.service';
import {EventInterface} from '../../entities/events/event.interface';
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/operator/first';

declare const google: any;

@Injectable()
export class GeoLocationInfoService {

  private geoLocationsInfo: Map<string, GeoLocationInfo> = new Map<string, GeoLocationInfo>();

  constructor(private geoLocationInfoLocalStorageService: GeoLocationInfoLocalStorageService, private mapsAPILoader: MapsAPILoader) {
  }

  public getGeoLocationInfo(event: EventInterface): Observable<GeoLocationInfo> {
    return Observable.fromPromise(new Promise((resolve, reject) => {
      const position = event.getPointsWithPosition()[0].getPosition();
      if (this.geoLocationsInfo.get([position.latitudeDegrees, position.longitudeDegrees].join(','))) {
        return resolve(this.geoLocationsInfo.get([position.latitudeDegrees, position.longitudeDegrees].join(',')));
      }
      this.mapsAPILoader.load().then(() => {
        (new google.maps.Geocoder()).geocode({
          'location': {
            lat: position.latitudeDegrees,
            lng: position.longitudeDegrees
          }
        }, (results, status) => {
          if (!status === google.maps.GeocoderStatus.OK || !results || !results.length) {
            return reject(status);
          }
          const geoLocationInfo = results[0].address_components.reduce((geoLocationInfoBuilder: GeoLocationInfo, addressComponent) => {
            switch (addressComponent.types[0]) {
              case 'country': {
                geoLocationInfoBuilder.country = addressComponent.long_name;
                break;
              }
              case 'locality': {
                geoLocationInfoBuilder.city = addressComponent.long_name;
                break;
              }
              case 'administrative_area_level_1': {
                geoLocationInfoBuilder.province = addressComponent.long_name;
                break;
              }
            }
            return geoLocationInfoBuilder;
          }, new GeoLocationInfo(position.latitudeDegrees, position.longitudeDegrees));
          this.geoLocationsInfo.set([position.latitudeDegrees, position.longitudeDegrees].join(','), geoLocationInfo);
          return resolve(geoLocationInfo);
        });
      });
    }));
  }
}
