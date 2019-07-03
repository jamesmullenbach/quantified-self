import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import {Log} from 'ng2-logger/browser'
import {EventColorService} from '../../../../services/color/app.event.color.service';
import {ActivityInterface} from 'quantified-self-lib/lib/activities/activity.interface';
import {EventInterface} from 'quantified-self-lib/lib/events/event.interface';
import {DataHeartRate} from 'quantified-self-lib/lib/data/data.heart-rate';
import * as am4core from '@amcharts/amcharts4/core';
import * as am4charts from '@amcharts/amcharts4/charts';
import {combineLatest, Subscription} from 'rxjs';
import {EventService} from '../../../../services/app.event.service';
import {DataAltitude} from 'quantified-self-lib/lib/data/data.altitude';
import {map, take} from 'rxjs/operators';
import {StreamInterface} from 'quantified-self-lib/lib/streams/stream.interface';
import {DynamicDataLoader} from 'quantified-self-lib/lib/data/data.store';
import {User} from 'quantified-self-lib/lib/users/user';
import {DataPace, DataPaceMinutesPerMile} from 'quantified-self-lib/lib/data/data.pace';
import {
  ChartThemes,
  UserChartSettingsInterface,
  XAxisTypes
} from 'quantified-self-lib/lib/users/user.chart.settings.interface';
import {UserUnitSettingsInterface} from 'quantified-self-lib/lib/users/user.unit.settings.interface';
import {DataSpeed} from 'quantified-self-lib/lib/data/data.speed';
import {DataVerticalSpeed} from 'quantified-self-lib/lib/data/data.vertical-speed';
import {UserSettingsService} from '../../../../services/app.user.settings.service';
import {ThemeService} from '../../../../services/app.theme.service';
import {EventUtilities} from 'quantified-self-lib/lib/events/utilities/event.utilities';
import {ChartAbstract} from '../../../charts/chart.abstract';
import {DataDistance} from 'quantified-self-lib/lib/data/data.distance';

@Component({
  selector: 'app-event-card-chart',
  templateUrl: './event.card.chart.component.html',
  styleUrls: ['./event.card.chart.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCardChartComponent extends ChartAbstract implements OnChanges, OnInit, OnDestroy, AfterViewInit {

  @ViewChild('chartDiv', {static: true}) chartDiv: ElementRef;
  @ViewChild('legendDiv', {static: true}) legendDiv: ElementRef;
  @Input() event: EventInterface;
  @Input() user: User;
  @Input() userChartSettings: UserChartSettingsInterface;
  @Input() userUnitSettings: UserUnitSettingsInterface;
  @Input() selectedActivities: ActivityInterface[] = [];
  @Input() isVisible: boolean;
  @Input() showAllData: boolean;
  @Input() xAxisType: XAxisTypes;
  @Input() dataSmoothingLevel: number;
  @Input() waterMark: string;
  @Input() chartTheme: ChartThemes = ChartThemes.Material;


  public distanceAxesForActivitiesMap = new Map<string, StreamInterface>();
  public isLoading: boolean;

  private streamsSubscription: Subscription;
  protected chart: am4charts.XYChart;
  protected logger = Log.create('EventCardChartComponent');


  constructor(private  changeDetector: ChangeDetectorRef,
              protected zone: NgZone,
              private eventService: EventService,
              private userSettingsService: UserSettingsService,
              private themeService: ThemeService,
              private eventColorService: EventColorService) {
    super(zone);
  }

  async ngAfterViewInit() {
  }

  async ngOnInit() {
    if (!this.user || !this.event) {
      throw new Error('Component needs events and users');
    }
  }

  async ngOnChanges(simpleChanges) {
    // WARNING DO NOT ALLOW READS IF NOT VISIBLE! //


    // If not visible and no data is bound do nothing
    if (!this.isVisible && (!this.streamsSubscription || this.streamsSubscription.closed)) {
      return;
    }

    if (simpleChanges.chartTheme || simpleChanges.xAxisType) {
      this.destroyChart();
    }

    // 1. If there is no chart create
    if (!this.chart) {
      this.chart = this.createChart();
    }

    // Beyond here component is visible and data is not bound //

    // 3. If something changed then do the needed
    if (simpleChanges.event
      || simpleChanges.selectedActivities
      || simpleChanges.showAllData
      || simpleChanges.userChartSettings
      || simpleChanges.dataSmoothingLevel
      || simpleChanges.xAxisType
      || simpleChanges.chartTheme) {
      if (!this.event || !this.selectedActivities.length) {
        this.unsubscribeAndClearChart();
        return;
      }
      this.unsubscribeAndClearChart();
      this.processChanges(await this.userSettingsService.selectedDataTypes(this.event));
    }

    // 4. If nothing has changed but we do not have data binding then bind
    if (!this.streamsSubscription || this.streamsSubscription.closed) {
      this.processChanges(await this.userSettingsService.selectedDataTypes(this.event));
    }
  }

  private async processChanges(selectedDataTypes: string[] | null) {
    this.loading();
    if (this.xAxisType === XAxisTypes.Distance) {
      for (const selectedActivity of this.selectedActivities) {
        this.distanceAxesForActivitiesMap.set(
          selectedActivity.getID(),
          (await this.eventService.getStreamsByTypes(this.user, this.event.getID(), selectedActivity.getID(), [DataDistance.type]).pipe(take(1)).toPromise())[0]
        );
      }
    }
    this.streamsSubscription = combineLatest(this.selectedActivities.map((activity) => {
      const allOrSomeSubscription = this.eventService.getStreamsByTypes(this.user, this.event.getID(), activity.getID(),
        this.getDataTypesToRequest(), //
      );
      return allOrSomeSubscription.pipe(map((streams) => {
        if (!streams.length) {
          return [];
        }
        // @todo create whitelist for unitstreams and not generate all and then remove ...
        // We get the unit streams and we filter on them based on the user pref
        const unitStreams = EventUtilities.getUnitStreamsFromStreams(streams).filter(stream => {
          return this.getUnitBasedDataTypesToUseFromDataTypes(streams.map(st => st.type), this.userUnitSettings).indexOf(stream.type) !== -1;
        });
        // debugger;
        return unitStreams.concat(streams).map((stream) => {
          return this.createOrUpdateChartSeries(activity, stream, selectedDataTypes);
        });
      }))
    })).pipe(map((seriesArrayOfArrays) => {
      // Format flatten the arrays as they come in [[], []]
      return seriesArrayOfArrays.reduce((accu: [], item: []): am4charts.XYSeries[] => accu.concat(item), [])
    })).subscribe((series: am4charts.LineSeries[]) => {
      // this.chart.xAxes.getIndex(0).title.text = this.xAxisType;
      this.logger.info(`Rendering chart data per series`);
      series.forEach((currentSeries) => this.addDataToSeries(currentSeries, currentSeries.dummyData));
      this.logger.info(`Data Injected`);

      // this.chart.xAxes.getIndex(0).title.text = this.xAxisType;
      // After you have all the info adjust the axis if needed
      // if (this.xAxisType === XAxisTypes.Distance){
      //   (<am4charts.ValueAxis>this.chart.xAxes.getIndex(0)).max = this.distanceAxesForActivitiesMap.values(() =>{
      //   debugger;
      // })
      //   this.chart.xAxes.getIndex(0).strictMinMax = true;
      // }
    });
  }

  private createChart(): am4charts.XYChart {
    return this.zone.runOutsideAngular(() => {
      this.applyChartStylesFromUserSettings(this.userChartSettings, this.chartTheme);

      // Create a chart
      am4core.options.commercialLicense = true;

      const chart = am4core.create(this.chartDiv.nativeElement, am4charts.XYChart);
      chart.pixelPerfect = false;
      chart.fontSize = '0.75em';
      chart.padding(0, 10, 0, 0);
      // chart.resizable = false;

      let xAxis;
      if (this.xAxisType === XAxisTypes.Distance) {
        xAxis = chart.xAxes.push(new am4charts.ValueAxis());
        // xAxis.extraMax = 0.01;
        xAxis.renderer.minGridDistance = 20;
        // xAxis.renderer.gridDistance = 1;

        xAxis.numberFormatter = new am4core.NumberFormatter();
        xAxis.numberFormatter.numberFormat = `#`;
        // valueAxis.numberFormatter.numberFormat = `#${DynamicDataLoader.getDataClassFromDataType(this.chartDataType).unit}`;
        xAxis.renderer.labels.template.adapter.add('text', (text, target) => {
          const data = DynamicDataLoader.getDataInstanceFromDataType(DataDistance.type, Number(text));
          return `[bold font-size: 1.0em]${data.getDisplayValue()}[/]${data.getDisplayUnit()}`
        });
        // xAxis.tooltipText = '{valueX}'
        xAxis.adapter.add('getTooltipText', (text, target) => {
          const data = DynamicDataLoader.getDataInstanceFromDataType(DataDistance.type, Number(text));
          return `[bold font-size: 1.0em]${data.getDisplayValue()}[/]${data.getDisplayUnit()}`
        });
        xAxis.renderer.labels.template.marginRight = 10;
        xAxis.min = 0;
      } else {
        // Create a date axis
        xAxis = chart.xAxes.push(new am4charts.DateAxis());
        // dateAxis.skipEmptyPeriods= true;
      }
      xAxis.title.text = this.xAxisType;

      // dateAxis.baseInterval = {
      //   timeUnit: "second",
      //   count: 1
      // //   count: this.getStreamSamplingRateInSeconds(this.selectedActivities),
      // };
      // dateAxis.skipEmptyPeriods= true;

      // Create a value axis
      // const valueAxis = chart.yAxes.push(new am4charts.ValueAxis());
      // chart.durationFormatter.durationFormat = " mm ':' ss 'min/km'";

      // Create a Legend
      chart.legend = new am4charts.Legend();
      chart.legend.fontSize = '0.9em';
      chart.legend.parent = am4core.create(this.legendDiv.nativeElement, am4core.Container);
      chart.legend.parent.width = am4core.percent(100);
      chart.legend.parent.height = am4core.percent(100);

      chart.legend.useDefaultMarker = true;
      const marker = <am4core.RoundedRectangle>chart.legend.markers.template.children.getIndex(0);
      marker.cornerRadius(12, 12, 12, 12);
      marker.strokeWidth = 2;
      marker.strokeOpacity = 1;
      marker.stroke = am4core.color('#0a97ee');


      chart.legend.itemContainers.template.events.on('toggled', (ev) => {
        const series = <am4charts.LineSeries>ev.target.dataItem.dataContext;
        // Getting visible...
        if (!ev.target.readerChecked === true) {
          this.showSeries(series, true)
        } else {
          this.hideSeries(series, true)
        }
      });

      // Create a cursor
      chart.cursor = new am4charts.XYCursor();
      // chart.cursor.fullWidthLineX = true;
      // chart.cursor.fullWidthLineY = true;
      // chart.cursor.behavior = 'zoomY';

      // Add watermark
      const watermark = new am4core.Label();
      watermark.text = this.waterMark || 'Quantified-Self.io';
      chart.plotContainer.children.push(watermark);
      watermark.align = 'right';
      watermark.valign = 'bottom';
      watermark.fontSize = '2.1em';
      watermark.opacity = 0.8;
      watermark.marginRight = 25;
      watermark.marginBottom = 5;
      watermark.zIndex = 100;
      // watermark.fontWeight = 'bold';


      // Scrollbar
      // chart.scrollbarX = new am4charts.XYChartScrollbar();

      // Add exporting options
      chart.exporting.menu = this.getExportingMenu();

      chart.exporting.extraSprites.push({
        'sprite': chart.legend.parent,
        'position': 'bottom',
        'marginTop': 20
      });

      // Disable the preloader
      chart.preloader.disabled = true;

      // Attach events
      chart.events.on('validated', (ev) => {
        this.logger.info('validated');
        if (ev.target.data.length) {
          this.loaded();
        }
      });

      chart.events.on('globalscalechanged', (ev) => {
        this.logger.info('globalscalechanged');
      });

      chart.events.on('dataitemsvalidated', (ev) => {
        this.logger.info('dataitemsvalidated');
      });


      chart.events.on('datavalidated', (ev) => {
        this.logger.info('datavalidated');
      });

      chart.events.on('datarangechanged', (ev) => {
        this.logger.info('datarangechanged');
      });

      chart.events.on('ready', (ev) => {
        this.logger.info('ready');
      });


      chart.events.on('shown', (ev) => {
        this.logger.info('shown');
      });

      chart.events.on('transformed', (ev) => {
        this.logger.info('transformed');
      });

      chart.events.on('maxsizechanged', (ev) => {
        this.logger.info('maxsizechanged');
        ev.target.legend.svgContainer.htmlElement.style.height = this.chart.legend.contentHeight + 'px'; // @todo test
      });

      chart.events.on('visibilitychanged', (ev) => {
        this.logger.info('visibilitychanged');
      });

      chart.events.on('hidden', (ev) => {
        this.logger.info('hidden');
      });
      chart.events.on('shown', (ev) => {
        this.logger.info('shown');
      });

      chart.events.on('inited', (ev) => {
        this.logger.info('inited');
      });

      return chart;
    });
  }

  private createOrUpdateChartSeries(activity: ActivityInterface, stream: StreamInterface, selectedDataTypes?: string[] | null): am4charts.XYSeries {
    let series = this.chart.series.values.find(series => series.id === `${activity.getID()}${stream.type}`);
    // If there is already a series with this id only data update should be done
    if (series) {
      series.dummyData = this.convertStreamDataToSeriesData(activity, stream);
      return series
    }

    let yAxis: am4charts.Axis;

    // Check if we have a series with the same name aka type
    const sameTypeSeries = this.chart.series.values.find((serie) => serie.name === this.getSeriesName(stream.type));
    if (!sameTypeSeries) {
      yAxis = this.chart.yAxes.push(this.getYAxisForSeries(stream.type));
    } else {
      // Share
      yAxis = sameTypeSeries.yAxis;
    }

    yAxis.tooltip.disabled = true;
    yAxis.interpolationDuration = 500;
    yAxis.rangeChangeDuration = 500;
    // yAxis.renderer.inside = true;
    yAxis.renderer.minLabelPosition = 0.05;
    yAxis.renderer.maxLabelPosition = 0.95;
    yAxis.renderer.axisFills.template.disabled = true;
    yAxis.renderer.ticks.template.disabled = true;

    // Then create a series
    series = this.chart.series.push(new am4charts.LineSeries());
    series.simplifiedProcessing = true;

    this.chart.series.sort((left, right) => {
      if (left.name < right.name) {
        return -1;
      }
      if (left.name > right.name) {
        return 1;
      }
      return 0;
    });

    // Set the axis
    series.yAxis = yAxis;

    // Setup the series
    series.id = `${activity.getID()}${stream.type}`;

    // Name is acting like a type so get them grouped
    series.name = this.getSeriesName(stream.type);

    if ([DataPace.type, DataPaceMinutesPerMile.type].indexOf(stream.type) !== -1) {
      series.tooltipText = `${activity.creator.name} ${DynamicDataLoader.getDataClassFromDataType(stream.type).type} {valueY.formatDuration()} ${DynamicDataLoader.getDataClassFromDataType(stream.type).unit}`;
    } else {
      series.tooltipText = `${activity.creator.name} ${DynamicDataLoader.getDataClassFromDataType(stream.type).displayType || DynamicDataLoader.getDataClassFromDataType(stream.type).type} {valueY} ${DynamicDataLoader.getDataClassFromDataType(stream.type).unit}`;
    }

    series.legendSettings.labelText = `${DynamicDataLoader.getDataClassFromDataType(stream.type).displayType || DynamicDataLoader.getDataClassFromDataType(stream.type).type} ` + (DynamicDataLoader.getDataClassFromDataType(stream.type).unit ? ` (${DynamicDataLoader.getDataClassFromDataType(stream.type).unit})` : '') + ` [${am4core.color(this.eventColorService.getActivityColor(this.event, activity)).toString()}]${activity.creator.name}[/]`;
    // series.legendSettings.itemValueText = `{valueY} ${DynamicDataLoader.getDataClassFromDataType(stream.type).unit}`;

    // Search if there is any other series with the same color we would like to have
    const found = this.chart.series.values.find((series) => {
      return series.stroke.toString() === am4core.color(this.eventColorService.getActivityColor(this.event, activity)).toString();
    });
    // IF there is no other series with the same color then add the activity color
    if (!found) {
      // series.stroke = am4core.color(this.eventColorService.getActivityColor(this.event, activity));
      // series.fill = am4core.color(this.eventColorService.getActivityColor(this.event, activity));
      series.adapter.add('fill', (fill, target) => {
        return series.chart.colors.getIndex(series.chart.series.indexOf(target));
      });
      series.adapter.add('stroke', (fill, target) => {
        return series.chart.colors.getIndex(series.chart.series.indexOf(target));
      });
    }

    series.strokeWidth = 1.2;
    series.fillOpacity = 0.3;
    // series.defaultState.transitionDuration = 0;

    series.dataFields.valueY = 'value';
    series.dataFields.dateX = 'time';
    series.dataFields.valueX = 'distance';
    // series.dataFields.categoryX = 'distance';

    series.interactionsEnabled = false;

    // Show an hide on condition
    if (selectedDataTypes && selectedDataTypes.length) {
      if (selectedDataTypes.indexOf(series.id) === -1) {
        this.hideSeries(series);
      } else {
        this.showSeries(series);
      }
    } else if (([DataHeartRate.type, DataAltitude.type].indexOf(stream.type) === -1) || this.getVisibleSeries(this.chart).length > (this.selectedActivities.length * 2)) {
      this.hideSeries(series);
    }

    // Attach events
    series.events.on('validated', (ev) => {
      this.logger.info(`Series ${ev.target.id} validated`);
      // this.legendDiv.nativeElement.style.height = this.chart.legend.contentHeight + "px";
      // if (this.chart.series.getIndex(0) && this.chart.series.getIndex(0).data && this.chart.series.getIndex(0).dummyData.length) {
      ev.target.chart.legend.svgContainer.htmlElement.style.height = this.chart.legend.contentHeight + 'px'; // @todo test
      this.loaded();
      // }
    });

    series.events.on('ready', (ev) => {
      this.logger.info('Series ready');
    });

    // this.chart.invalidateData(); // @todo Perhaps this can go away.
    // Finally set the data and return
    series.dummyData = this.convertStreamDataToSeriesData(activity, stream);
    return series;
  }

  private convertStreamDataToSeriesData(activity: ActivityInterface, stream: StreamInterface): any {
    let data = [];
    const samplingRate = this.getStreamSamplingRateInSeconds(stream);
    this.logger.info(`Stream data for ${stream.type} length before sampling ${stream.data.length}`);
    if (this.xAxisType === XAxisTypes.Distance && this.distanceAxesForActivitiesMap.get(activity.getID())) {
      const distanceStream = this.distanceAxesForActivitiesMap.get(activity.getID());
      stream.data.reduce((dataMap, streamDataItem, index) => { // Can use a data array but needs deduplex after
        if (distanceStream.data[index]) {
          // debugger;
          dataMap.set(distanceStream.data[index], streamDataItem)
        }
        return dataMap;
      }, new Map<number, number>()).forEach((value, distance) => {
        data.push({
          distance: String(distance),
          value: value
        })
      });
    } else {
      data = this.xAxisType === XAxisTypes.Time ? stream.getStreamDataByTime(activity.startDate) : stream.getStreamDataByDuration((new Date(0)).getTimezoneOffset() * 60000); // Default unix timestamp is at 1 hours its kinda hacky but easy
    }
    data = data
      .filter((streamData) => streamData.value !== null)
      .filter((streamData, index) => (index % samplingRate) === 0);
    this.logger.info(`Stream data for ${stream.type} after sampling and filtering ${data.length}`);
    return data;
  }

  private getStreamSamplingRateInSeconds(stream: StreamInterface): number {
    if (this.dataSmoothingLevel === 1) {
      return 1;
    }
    const numberOfSamples = stream.getNumericData().length;
    let samplingRate;
    const hoursToKeep1sSamplingRateForAllActivities = 2; // 2 hours
    const numberOfSamplesToHours = numberOfSamples / 3600;
    samplingRate = Math.ceil((numberOfSamplesToHours * this.dataSmoothingLevel * this.selectedActivities.length) / hoursToKeep1sSamplingRateForAllActivities);
    this.logger.info(`${numberOfSamples} for ${stream.type} are about ${numberOfSamplesToHours} hours. Sampling rate is ${samplingRate}`);
    return samplingRate;
  }

  private addDataToChart(data: any) {
    this.zone.runOutsideAngular(() => {
      this.chart.data = data;
    });
  }

  private addDataToSeries(series: am4charts.LineSeries, data: any) {
    this.zone.runOutsideAngular(() => {
      series.data = data;
    });
  }

  private getDataFromSeriesDummyData(series: am4charts.LineSeries[]): any {
    const data = series.reduce((data, series) => {
      // debugger;
      series.dummyData.forEach((dataItem: { time: number, value: number | string | boolean }) => {
        // debugger;
        if (!data[dataItem.time]) {
          data[dataItem.time] = {time: dataItem.time}
        }
        data[dataItem.time][series.id] = dataItem.value;
      });
      return data;
    }, {});
    return Object.keys(data).map(key => data[key]).sort((dataItemA: any, dataItemB: any) => {
      return dataItemA.time - dataItemB.time;
    })
  }

  private getDataTypesToRequest(): string[] {
    return this.getNonUnitBasedDataTypes();
  }

  /**
   * This get's the basic data types for the charts depending or not on the user datatype settings
   * There are no unit specific datatypes here so if the user has selected pace it implies metric
   */
  private getNonUnitBasedDataTypes(): string[] {
    let dataTypes = DynamicDataLoader.basicDataTypes;
    // Set the datatypes to show if all is selected
    if (this.showAllData) {
      dataTypes = DynamicDataLoader.allDataTypes;
    }
    // If there is a change in the user chart settings and its valid update settings
    if (this.userChartSettings && !this.showAllData) {
      // Set the datatypes to use
      dataTypes = Object.keys(this.userChartSettings.dataTypeSettings).reduce((dataTypesToUse, dataTypeSettingsKey) => {
        if (this.userChartSettings.dataTypeSettings[dataTypeSettingsKey].enabled === true) {
          dataTypesToUse.push(dataTypeSettingsKey);
        }
        return dataTypesToUse;
      }, []);
    }
    return dataTypes;
  }

  /**
   * This gets the base and extended unit datatypes from a datatype array depending on the user settings
   * @param dataTypes
   * @param userUnitSettings
   */
  private getUnitBasedDataTypesToUseFromDataTypes(dataTypes: string[], userUnitSettings?: UserUnitSettingsInterface): string[] {
    let unitBasedDataTypes = [];
    if (!userUnitSettings) {
      return unitBasedDataTypes
    }
    if (dataTypes.indexOf(DataPace.type) !== -1) {
      unitBasedDataTypes = unitBasedDataTypes.concat(userUnitSettings.paceUnits);
    }
    if (dataTypes.indexOf(DataSpeed.type) !== -1) {
      unitBasedDataTypes = unitBasedDataTypes.concat(userUnitSettings.speedUnits);
    }
    if (dataTypes.indexOf(DataVerticalSpeed.type) !== -1) {
      unitBasedDataTypes = unitBasedDataTypes.concat(userUnitSettings.verticalSpeedUnits);
    }
    return unitBasedDataTypes;
  }

  protected hideSeries(series: am4charts.XYSeries, save?: boolean) {
    super.hideSeries(series);
    if (save) {
      this.userSettingsService.setSelectedDataTypes(this.event, this.getVisibleSeries(series.chart).map(series => series.id));
    }
  }

  protected showSeries(series: am4charts.XYSeries, save?: boolean) {
    super.showSeries(series);
    if (save) {
      this.userSettingsService.setSelectedDataTypes(this.event, this.getVisibleSeries(series.chart).map(series => series.id));
    }
  }

  private loading() {
    this.isLoading = true;
    this.changeDetector.detectChanges();
  }

  private loaded() {
    this.isLoading = false;
    this.changeDetector.detectChanges();
  }

  protected getSubscriptions(): Subscription[] {
    return this.streamsSubscription ? [this.streamsSubscription] : [];
  }
}
