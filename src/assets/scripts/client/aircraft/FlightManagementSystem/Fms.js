import _drop from 'lodash/drop';
import _findIndex from 'lodash/findIndex';
import _get from 'lodash/get';
import _isEmpty from 'lodash/isEmpty';
import _isNil from 'lodash/isNil';
import _isObject from 'lodash/isObject';
import _map from 'lodash/map';
import ModeController from '../ModeControl/ModeController';
import LegModel from './LegModel';
import { routeStringFormatHelper } from '../../navigationLibrary/Route/routeStringFormatHelper';
import {
    MCP_MODE,
    MCP_MODE_NAME,
    MCP_PROPERTY_MAP
} from '../ModeControl/modeControlConstants';

/**
 *
 *
 * This class should always be instantiated from an `AircraftInstanceModel` and
 * always instantiated with some form of a `spawnPatternModel`.
 *
 * @class Fms
 */
export default class Fms {
    /**
     * @constructor
     * @param aircraftInitProps {object}
     * @param initialRunwayAssignment {string}
     * @param navigationLibrary {NavigationLibrary}
     */
    constructor(aircraftInitProps, initialRunwayAssignment, typeDefinitionModel, navigationLibrary) {
        if (!_isObject(aircraftInitProps) || _isEmpty(aircraftInitProps)) {
            throw new TypeError('Invalid aircraftInitProps passed to Fms');
        }

        /**
         * Instance of the `NavigationLibrary`
         *
         * provides access to the aiport SIDs, STARs and Fixes via collection objects and fascade methods.
         * used for route building
         *
         * @property _navigationLibrary
         * @type {NavigationLibrary}
         * @private
         */
        this._navigationLibrary = navigationLibrary;

        /**
         * Keeps track of current Altitude, Heading and Speed modes and values.
         *
         * @property _modeController
         * @type {ModeController}
         */
        this._modeController = new ModeController(typeDefinitionModel);

        /**
         *
         *
         * @property _aircraftTypeDefinition
         * @type {AircraftTypeDefinitionModel}
         * @private
         */
        this._aircraftTypeDefinition = typeDefinitionModel;

        /**
         * Name of the initial runway assigned for takeoff/landing.
         *
         * This value is likely to change as an aircraft moves through the airspace.
         *
         * @property _runway
         * @type {string}
         * @private
         */
        this._runwayName = initialRunwayAssignment;

        /**
         * Collection of `LegModel` objects
         *
         * A `LegModel` represents a section of a flight plan:
         * - single `WaypointModel` without restrictions (not part of a standard procedure)
         * - single `WaypointModel` assigned to hold at
         * - standard procedure (sid/star), which may contain may `WaypointModel` objects,
         *   each which may contain restrictions
         *
         * @property legCollection
         * @type {array}
         * @default []
         */
        this.legCollection = [];

        /**
         * Current flight phase of an aircraft
         *
         * Currently only supports `arrival` and `departure`
         *
         * @property currentPhase
         * @type {string}
         * @default ''
         */
        this.currentPhase = '';

        this.init(aircraftInitProps);
    }

    /**
     * The active waypoint an aircraft is flying towards
     *
     * Assumed to ALWAYS be the first `WaypointModel` in the `currentLeg`
     *
     * @property currentWaypoint
     * @type {WaypointModel}
     */
    get currentWaypoint() {
        return this.currentLeg.currentWaypoint;
    }

    /**
     * The active Leg in the `legCollection`
     *
     * Assumed to ALWAYS be the first `LegModel` in the `legCollection`
     *
     * @property currentLeg
     * @return {LegModel}
     */
    get currentLeg() {
        return this.legCollection[0];
    }

    /**
     * Builds a routeString from the current legs in the `legCollection` and joins
     * each section with `..`
     *
     * A `routeString` might look like one of the following:
     * - `cowby..bikkr..dag.kepec3.klas`
     * - `cowby`
     * - `dag.kepec3.klas`
     *
     * @property currentRoute
     * @return {string}
     */
    get currentRoute() {
        const routeSegments = _map(this.legCollection, (legModel) => legModel.routeString);

        return routeSegments.join('..');
    }

    /**
     * Based on reasons, return the current altitude the aircraft should be at.
     *
     * This might not be the altitude it is at currently.
     *
     * @for Fms
     * @method getAltitude
     * @return altitude {number}
     */
    getAltitude() {
        let altitude = this._aircraftTypeDefinition.ceiling;

        if (this.currentWaypoint.altitudeRestriction !== -1) {
            altitude = this.currentWaypoint.altitudeRestriction;
        }

        if (this._modeController.altitudeMode === MCP_MODE.ALTITUDE.HOLD) {
            altitude = this._modeController.altitude;
        }

        return altitude;
    }

    /**
     * Based on reasons, return the current heading the aircraft should be at.
     *
     * This might not be the heading it is at currently.
     *
     * @for Fms
     * @method getAltitude
     * @return heading {number}
     */
    getHeading() {
        let heading = -999;

        if (this._modeController.headingMode === MCP_MODE.HEADING.HOLD) {
            heading = this._modeController.heading;
        }

        return heading;
    }

    /**
     * Based on reasons, return the current speed the aircraft should be at.
     *
     * This might not be the speed it is at currently.
     *
     * @for Fms
     * @method getSpeed
     * @return speed {number}
     */
    getSpeed() {
        let speed = this._aircraftTypeDefinition.speed.cruise;

        if (this.currentWaypoint.speedRestriction !== -1) {
            speed = this.currentWaypoint.speedRestriction;
        }

        if (this._modeController.speedMode === MCP_MODE.SPEED.HOLD) {
            speed = this._modeController.speed;
        }

        return speed;
    }

    /**
     * Initialize the instance and setup initial properties
     *
     * @for Fms
     * @method init
     * @param aircraftInitProps {object}
     */
    init(aircraftInitProps) {
        this.currentPhase = aircraftInitProps.category;
        this.legCollection = this._buildInitialLegCollection(aircraftInitProps);
    }

    /**
     * Destroy the instance and reset properties
     *
     * @for LegModel
     * @method destroy
     */
    destroy() {
        this._navigationLibrary = null;
        this._runwayName = '';
        this.legCollection = [];
        this.currentPhase = '';
    }

    /**
     * Wrapper method that sets the `_modeController` modes
     * for an arriving aircraft
     *
     * @for Fms
     * @method updateModesForArrival
     */
    updateModesForArrival() {
        this._modeController.setModesForArrival();
    }

    /**
     * Wrapper method that sets the `_modeController` modes
     * for a departing aircraft
     *
     * @for Fms
     * @method updateModesForDeparture
     */
    updateModesForDeparture() {
        this._modeController.setModesForDeparture();
    }

    /**
     * Set `_modeController` altitudeMode to `VNAV`
     *
     * @for Fms
     * @method setAltitudeVnav
     */
    setAltitudeVnav() {
        this._modeController.setModeAndValue(
            MCP_MODE_NAME.ALTITUDE,
            MCP_MODE.ALTITUDE.VNAV,
            this.currentWaypoint.altitudeRestriction
        );
    }

    /**
     * Set `_modeController` altitudeMode to `HOLD` with the altitude to hold
     *
     * @for Fms
     * @method setAltitudeHold
     * @param altitude {number}
     */
    setAltitudeHold(altitude) {
        this._modeController.setModeAndValue(MCP_MODE_NAME.ALTITUDE, MCP_MODE.ALTITUDE.HOLD, altitude);
    }

    /**
     * Set `_modeController` headingMode to `LNAV` with a heading to the next waypoint
     *
     * @for Fms
     * @method setHeadingLnav
     * @param heading {number}
     */
    setHeadingLnav(heading) {
        this._modeController.setModeAndValue(MCP_MODE_NAME.HEADING, MCP_MODE.HEADING.LNAV, heading);
    }

    /**
     * Set `_modeController` headingMode to `HOLD` with the heading to hold
     *
     * @for Fms
     * @method setHeadingHold
     * @param heading {number}
     */
    setHeadingHold(heading) {
        this._modeController.setModeAndValue(MCP_MODE_NAME.HEADING, MCP_MODE.HEADING.HOLD, heading);
    }

    /**
     * Set `_modeController` speedMode to `HOLD` with the speed to hold
     *
     * @for Fms
     * @method setSpeedHold
     * @param speed {number}
     */
    setSpeedHold(speed) {
        this._modeController.setModeAndValue(MCP_MODE_NAME.SPEED, MCP_MODE.SPEED.HOLD, speed);
    }

    /**
     * Add a new `LegModel` to the left side of the `legCollection`
     *
     * @for Fms
     * @method addLegToBeginning
     * @param routeString
     */
    addLegToBeginning(routeString) {
        const legModel = new LegModel(routeString, this._runwayName, this.currentPhase, this._navigationLibrary);

        this.legCollection.unshift(legModel);
    }

    /**
     * Encapsulation of boolean logic used to determine if there is a
     * WaypointModel available after the current one has been flown over.
     *
     * @for fms
     * @method hasNextWaypoint
     * @return {boolean}
     */
    hasNextWaypoint() {
        return this.currentLeg.hasNextWaypoint() || !_isNil(this.legCollection[1]);
    }

    /**
     * Move to the next possible waypoint
     *
     * This could be the next waypoint in the current leg,
     * or the first waypoint in the next leg.
     *
     * @for LegModel
     * @method nextWaypoint
     */
    nextWaypoint() {
        if (!this.currentLeg.hasNextWaypoint()) {
            this._moveToNextLeg();
        }

        this._moveToNextWaypointInLeg();

        // TODO: last else should be cancelFix()
    }

    /**
     * Given a `waypointName`, find the index of that waypoint within
     * the `legsColelction`. Then make that Leg active and `waypointName`
     * the active waypoint for that Leg.
     *
     * @for Fms
     * @method skipToWaypoint
     * @param waypointName {string}
     */
    skipToWaypoint(waypointName) {
        const { legIndex, waypointIndex } = this._findLegAndWaypointIndexForWaypointName(waypointName);

        this.legCollection = _drop(this.legCollection, legIndex);

        this.currentLeg.skipToWaypointAtIndex(waypointIndex);
    }

    /**
     * Get the position of the next waypoint in the flightPlan.
     *
     * Currently only Used in `calculateTurnInitiaionDistance()` helper function
     *
     * @for Fms
     * @method getNextWaypointPosition
     * @return waypointPosition {array|null}
     */
    getNextWaypointPosition() {
        let waypointPosition;

        if (!this.hasNextWaypoint()) {
            return null;
        }

        waypointPosition = this.currentLeg.nextWaypoint.position;

        if (!this.currentLeg.hasNextWaypoint()) {
            waypointPosition = this.legCollection[1].currentWaypoint.position;
        }

        return waypointPosition;
    }

    /**
     * From a routeString, find each routeString segment and create
     * new `LegModels` for each segment then retun that list.
     *
     * Used on instantiation to build the initial `legCollection`.
     *
     * @for LegModel
     * @method _buildInitialLegCollection
     * @param aircraftInitProps {object}
     * @return {array<LegModel>}
     * @private
     */
    _buildInitialLegCollection(aircraftInitProps) {
        const { route } = aircraftInitProps;
        const routeStringSegments = routeStringFormatHelper(route);
        const legsForRoute = _map(routeStringSegments, (routeSegment) => {
            return new LegModel(routeSegment, this._runwayName, this.currentPhase, this._navigationLibrary);
        });

        return legsForRoute;
    }

    /**
     * Make the next `WaypointModel` in the currentLeg the currentWaypoint
     *
     * @for Fms
     * @method _moveToNextWaypointInLeg
     * @private
     */
    _moveToNextWaypointInLeg() {
        this.currentLeg.moveToNextWaypoint();
    }

    /**
     * Make the next `LegModel` in the `legCollection` the currentWaypoint
     *
     * @for Fms
     * @method _moveToNextLeg
     */
    _moveToNextLeg() {
        this.currentLeg.destroy();
        // this is mutable
        this.legCollection.shift();
    }

    /**
     * Loop through the `LegModel`s in the `#legCollection` untill
     * the `waypointName` is found, then return the location indicies
     * for the Leg and Waypoint.
     *
     * Used to adjust `currentLeg` and `currentWaypoint` values by
     * dropping items to the left of these indicies.
     *
     * @for Fms
     * @method _findLegAndWaypointIndexForWaypointName
     * @param waypointName {string}
     * @return {object}
     * @private
     */
    _findLegAndWaypointIndexForWaypointName(waypointName) {
        let legIndex;
        let waypointIndex = -1;

        for (legIndex = 0; legIndex < this.legCollection.length; legIndex++) {
            const legModel = this.legCollection[legIndex];
            waypointIndex = _findIndex(legModel.waypointCollection, { name: waypointName.toLowerCase() });

            if (waypointIndex !== -1) {
                break;
            }
        }

        return {
            legIndex,
            waypointIndex
        };
    }
}