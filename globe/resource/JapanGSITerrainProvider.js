/* eslint-disable camelcase */
/* eslint-disable eqeqeq */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-shadow */
/* eslint-disable no-plusplus */
/* eslint-disable no-param-reassign */
/* eslint-disable no-undef */
/* eslint-disable no-bitwise */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-restricted-properties */

import {
    defaultValue,
    defined,
    Credit,
    DeveloperError,
    Event,
    HeightmapTerrainData,
    Resource,
    TerrainProvider,
    WebMercatorTilingScheme,
} from 'cesium';

const pow2_16 = Math.pow(2, 16);
const pow2_8 = Math.pow(2, 8);
const pow2_23 = Math.pow(2, 23);
const pow2_24 = Math.pow(2, 24);

// ----- 標高タイルの既定値設定 -----

// pngを利用する場合
const GSI_MAX_TERRAIN_LEVEL = 14;
const GSI_DEM_DEFAULT_URL = 'https://cyberjapandata.gsi.go.jp/'
    + 'xyz/dem_png/{z}/{x}/{y}.png';

// ----------------------------------

const PROXY_URL = '';

const defaultCredit = new Credit('');

const DEMAREA = [
    '8/215/108',
    '8/215/109',
    '8/215/110',
    '8/216/108',
    '8/216/109',
    '8/216/110',
    '8/217/109',
    '8/218/107',
    '8/218/108',
    '8/219/101',
    '8/219/102',
    '8/219/103',
    '8/219/104',
    '8/219/105',
    '8/219/106',
    '8/219/107',
    '8/219/108',
    '8/220/101',
    '8/220/102',
    '8/220/103',
    '8/220/104',
    '8/220/105',
    '8/220/106',
    '8/220/107',
    '8/221/101',
    '8/221/102',
    '8/221/103',
    '8/221/104',
    '8/221/105',
    '8/221/108',
    '8/221/109',
    '8/221/110',
    '8/221/99',
    '8/222/100',
    '8/222/101',
    '8/222/102',
    '8/222/103',
    '8/223/100',
    '8/223/101',
    '8/223/102',
    '8/224/100',
    '8/224/101',
    '8/224/102',
    '8/224/113',
    '8/224/99',
    '8/225/100',
    '8/225/101',
    '8/225/102',
    '8/225/98',
    '8/225/99',
    '8/226/100',
    '8/226/101',
    '8/226/102',
    '8/226/98',
    '8/226/99',
    '8/227/100',
    '8/227/101',
    '8/227/102',
    '8/227/103',
    '8/227/104',
    '8/227/105',
    '8/227/93',
    '8/227/94',
    '8/227/95',
    '8/227/96',
    '8/227/97',
    '8/227/98',
    '8/227/99',
    '8/228/100',
    '8/228/107',
    '8/228/108',
    '8/228/109',
    '8/228/110',
    '8/228/91',
    '8/228/92',
    '8/228/93',
    '8/228/94',
    '8/228/95',
    '8/228/96',
    '8/228/97',
    '8/228/98',
    '8/228/99',
    '8/229/107',
    '8/229/108',
    '8/229/91',
    '8/229/92',
    '8/229/93',
    '8/229/94',
    '8/229/95',
    '8/229/97',
    '8/230/92',
    '8/230/93',
    '8/230/94',
    '8/231/92',
    '8/231/93',
    '8/231/94',
    '8/232/91',
    '8/232/92',
    '8/232/93',
    '8/233/91',
    '8/233/92',
    '8/237/110',
];
const DEMAREA2 = [
    '9/442/198',
    '9/438/202',
    '9/438/203',
    '9/439/202',
    '9/439/203',
    '9/457/182',
    '9/458/182',
    '9/442/197',
];

const DEMAREA3 = [
    '10/879/406',
    '10/879/407',
];
const JapanGSITerrainProvider = function JapanGSITerrainProvider(options = {}) {
    this._url = options.url;
    this._maxZoom = defaultValue(options.maxZoom, GSI_MAX_TERRAIN_LEVEL);
    this._proxy = options.proxy;
    this._heightPower = defaultValue(options.heightPower, 1);

    if (!this._url) {
        this._url = GSI_DEM_DEFAULT_URL;
    }

    const i = this._url.lastIndexOf('.');
    this._ext = (i > 0 ? this._url.substr(i) : '');

    this._tilingScheme = new WebMercatorTilingScheme({
        numberOfLevelZeroTilesX: 2,
    });

    this._heightmapWidth = 32;
    this._demDataWidth = 256;

    this._terrainDataStructure = {
        heightScale: this._heightPower,
        heightOffset: 0,
        elementsPerHeight: 1,
        stride: 1,
        elementMultiplier: 256,

        isBigEndian: false,
        lowestEncodedHeight: 0,
        highestEncodedHeight: 256 * 256 - 1,
    };

    this._levelZeroMaximumGeometricError = TerrainProvider
        .getEstimatedLevelZeroGeometricErrorForAHeightmap(
            this._tilingScheme.ellipsoid,
            this._heightmapWidth,
            this._tilingScheme.getNumberOfXTilesAtLevel(0),
        );

    this._errorEvent = new Event();
    this._ready = true;
    this._readyPromise = Promise.resolve();
    this._rectangles = [];

    let credit = defaultValue(options.credit, defaultCredit);
    if (typeof credit === 'string') credit = new Credit(credit);
    this._credit = credit;
};

JapanGSITerrainProvider.prototype
    // eslint-disable-next-line complexity
    .requestTileGeometry = function requestTileGeometry(
        x, y, level,
    ) {
        let tileUrl = this._url;
        let maxLevel = this._maxZoom;

        const demcheklebel = 8;
        if (level > demcheklebel) {
            let chekx = x;
            let cheky = y;
            chekx >>= level - demcheklebel + 1;
            cheky >>= level - demcheklebel;
            if (DEMAREA.indexOf(`${demcheklebel}/${chekx}/${cheky}`) != -1) {
                if (this._ext === '.png') {
                    tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/'
                    + '{z}/{x}/{y}.png';
                    maxLevel = 14;
                } else {
                    tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/dem/'
                    + '{z}/{x}/{y}.txt';
                    maxLevel = 14;
                }

                const demcheklebel2 = demcheklebel + 1;
                let chekx2 = x;
                let cheky2 = y;
                chekx2 >>= level - demcheklebel2 + 1;
                cheky2 >>= level - demcheklebel2;
                if (
                    DEMAREA2.indexOf(
                        `${demcheklebel2}/${chekx2}/${cheky2}`,
                    ) >= 0
                ) {
                    if (this._ext === '.png') {
                        tileUrl = 'https://cyberjapandata.gsi.go.jp/'
                        + 'xyz/demgm_png/{z}/{x}/{y}.png';
                        maxLevel = 8;
                    } else {
                        tileUrl = 'https://cyberjapandata.gsi.go.jp/'
                        + 'xyz/demgm/{z}/{x}/{y}.txt';
                        maxLevel = 8;
                    }
                    demcheklebel3 = demcheklebel2 + 1;
                    let chekx3 = x;
                    let cheky3 = y;
                    chekx3 >>= level - demcheklebel3 + 1;
                    cheky3 >>= level - demcheklebel3;
                    if (
                        level >= demcheklebel3
                        && DEMAREA3.indexOf(
                            `${demcheklebel3}/${chekx3}/${cheky3}`,
                        ) >= 0
                    ) {
                        if (this._ext === '.png') {
                            tileUrl = 'https://cyberjapandata.gsi.go.jp/'
                            + 'xyz/dem_png/{z}/{x}/{y}.png';
                            maxLevel = 14;
                        } else {
                            tileUrl = 'https://cyberjapandata.gsi.go.jp/'
                            + 'xyz/dem/{z}/{x}/{y}.txt';
                            maxLevel = 14;
                        }
                    }
                }
            } else if (this._ext === '.png') {
                tileUrl = 'https://cyberjapandata.gsi.go.jp/'
                + 'xyz/demgm_png/{z}/{x}/{y}.png';
                maxLevel = 8;
            } else {
                tileUrl = 'https://cyberjapandata.gsi.go.jp/'
                + 'xyz/demgm/{z}/{x}/{y}.txt';
                maxLevel = 8;
            }
        } else if (this._ext === '.png') {
            tileUrl = 'https://cyberjapandata.gsi.go.jp/'
            + 'xyz/demgm_png/{z}/{x}/{y}.png';
            maxLevel = 8;
        } else {
            tileUrl = 'https://cyberjapandata.gsi.go.jp/'
            + 'xyz/demgm/{z}/{x}/{y}.txt';
            maxLevel = 8;
        }

        if (PROXY_URL) tileUrl = PROXY_URL + tileUrl;

        const i = tileUrl.lastIndexOf('.');
        const ext = (i > 0 ? tileUrl.substr(i) : this._ext);

        if (ext === '.png') {
            this._loadProc = function _loadProc(url) {
                return Resource.fetchImage(url);
            };
            this._makeTileData = this._makePngTileData;
        } else {
            this._loadProc = Resource.fetchText;
            this._makeTileData = this._makeTextTileData;
        }

        const orgx = x;
        const orgy = y;
        let shift = 0;
        if (level > maxLevel) {
            shift = level - maxLevel;
            level = maxLevel;
        }

        x >>= shift + 1;
        y >>= shift;
        const shiftx = (orgx % Math.pow(2, shift + 1)) / Math.pow(2, shift + 1);
        const shifty = (orgy % Math.pow(2, shift)) / Math.pow(2, shift);

        let url = tileUrl
            .replace('{x}', x).replace('{y}', y).replace('{z}', level);

        const proxy = this._proxy;
        if (defined(proxy)) url = proxy.getURL(url);

        const promise = this._loadProc(url);

        const that = this;

        return this._makeTileData(
            x, y, level, promise, shift, shiftx, shifty, maxLevel,
        ).then((data) => {
            that._readyPromise = Promise.resolve(true);
            return data;
        });
    };

// テキストから
JapanGSITerrainProvider.prototype
    // eslint-disable-next-line max-params
    ._makeTextTileData = async function _makeTextTileData(
        x, y, level, promise, shift, shiftx, shifty,
    ) {
        const self = this;
        const data = await promise;
        const heightCSV = [];
        const LF = String.fromCharCode(10);
        const lines = data.split(LF);
        for (let i = 0; i < lines.length; i++) {
            const heights = lines[i].split(',');
            for (let j = 0; j < heights.length; j++) {
                if (heights[j] === 'e') heights[j] = 0;
            }
            heightCSV[i] = heights;
        }

        const whm = self._heightmapWidth;
        const wim = self._demDataWidth;
        const hmp = new Int16Array(whm * whm);

        for (let y = 0; y < whm; ++y) {
            for (let x = 0; x < whm; ++x) {
                const py = Math.round(
                    (y / Math.pow(2, shift) / (whm - 1) + shifty)
                        * (wim - 1),
                );
                const px = Math.round(
                    (x / Math.pow(2, shift + 1) / (whm - 1) + shiftx)
                        * (wim - 1),
                );

                hmp[y * whm + x] = Math.round(heightCSV[py][px]);
            }
        }

        return new HeightmapTerrainData({
            buffer: hmp,
            width: self._heightmapWidth,
            height: self._heightmapWidth,
            structure: self._terrainDataStructure,
            childTileMask: 15,
        });
    };

// png画像から
// eslint-disable-next-line max-params
JapanGSITerrainProvider.prototype._makePngTileData = async function _makePngTileData(
    x, y, level, promise, shift, shiftx, shifty,
) {
    const self = this;
    const img = await promise;
    const demDataWidth = self._demDataWidth;
    const heightmapWidth = self._heightmapWidth;
    if (!self._canvas) {
        self._canvas = document.createElement('canvas');
        self._ctx = self._canvas.getContext('2d');
        self._canvas.width = demDataWidth;
        self._canvas.height = demDataWidth;
    }
    self._ctx.drawImage(img, 0, 0);
    const { data } = self._ctx.getImageData(
        0, 0, demDataWidth, demDataWidth,
    );
    const result = new Int16Array(heightmapWidth * heightmapWidth);
    for (let y = 0; y < heightmapWidth; ++y) {
        for (let x = 0; x < heightmapWidth; ++x) {
            const py = Math.round(
                (y / Math.pow(2, shift) / (heightmapWidth - 1) + shifty)
                * (demDataWidth - 1),
            );
            const px = Math.round(
                (x / Math.pow(2, shift + 1) / (heightmapWidth - 1) + shiftx)
                * (demDataWidth - 1),
            );

            const idx = ((py * (demDataWidth * 4)) + (px * 4));
            const r = data[idx + 0];
            const g = data[idx + 1];
            const b = data[idx + 2];
            let h = 0;

            if (r != 128 || g != 0 || b != 0) {
                const d = r * pow2_16 + g * pow2_8 + b;
                h = (d < pow2_23) ? d : d - pow2_24;
                if (h == -pow2_23)h = 0;
                else h *= 0.01;
            }

            result[y * heightmapWidth + x] = Math.round(h);
        }
    }

    return new HeightmapTerrainData({
        buffer: result,
        width: self._heightmapWidth,
        height: self._heightmapWidth,
        structure: self._terrainDataStructure,
        childTileMask: 15,
    });
};

JapanGSITerrainProvider.prototype
    .getLevelMaximumGeometricError = function getLevelMaximumGeometricError(
        level,
    ) {
        return this._levelZeroMaximumGeometricError / (1 << level);
    };

JapanGSITerrainProvider.prototype.hasWaterMask = function hasWaterMask() {
    return !true;
};
JapanGSITerrainProvider.prototype
    .getTileDataAvailable = function getTileDataAvailable() {
        return undefined;
    };

/*
    JapanGSITerrainProvider(JapanGSITerrainProvider.prototype, {
        errorEvent : { get : function() { return this._errorEvent; } },
        credit : { get : function() { return this._credit; } },
        tilingScheme : { get : function() { return this._tilingScheme; } },
        ready : { get : function() { return true; } }
    });
    */
Object.defineProperties(JapanGSITerrainProvider.prototype, {
    errorEvent: {
        get() {
            return this._errorEvent;
        },
    },

    credit: {
        get() {
            if (!this._ready) {
                throw new DeveloperError(
                    'credit must not be called '
                    + 'before the terrain provider is ready.',
                );
            }

            return this._credit;
        },
    },

    tilingScheme: {
        get() {
            if (!this.ready) {
                throw new DeveloperError(
                    'requestTileGeometry must not be called '
                    + 'before ready returns true.',
                );
            }

            return this._tilingScheme;
        },
    },

    ready: {
        get() {
            return this._ready;
        },
    },

    readyPromise: {
        get() {
            return this._readyPromise;
        },
    },

    hasWaterMask: {
        get() {
            return false;
        },
    },

    hasVertexNormals: {
        get() {
            return false;
        },
    },

    requestVertexNormals: {
        get() {
            return false;
        },
    },

    requestWaterMask: {
        get() {
            return false;
        },
    },

    availability: {
        get() {
            return undefined;
        },
    },
});

export default JapanGSITerrainProvider;

/*
Cesium.Cartesian3.normalize = function(cartesian, result) {
    Cesium.Check.typeOf.object('cartesian', cartesian);
    Cesium.Check.typeOf.object('result', result);

    let magnitude = Cesium.Cartesian3.magnitude(cartesian);
    if (magnitude == 0) magnitude = 1;

    result.x = cartesian.x / magnitude;
    result.y = cartesian.y / magnitude;
    result.z = cartesian.z / magnitude;

    if (isNaN(result.x) || isNaN(result.y) || isNaN(result.z)) {
        throw new DeveloperError('normalized result is not a number');
    }

    return result;
};

Cesium.HeightmapTerrainData.prototype.createMesh = function(tilingScheme, x, y, level, exaggeration) {
    if (!Cesium.defined(tilingScheme)) {
        throw new Cesium.DeveloperError('tilingScheme is required.');
    }
    if (!Cesium.defined(x)) {
        throw new Cesium.DeveloperError('x is required.');
    }
    if (!Cesium.defined(y)) {
        throw new Cesium.DeveloperError('y is required.');
    }
    if (!Cesium.defined(level)) {
        throw new Cesium.DeveloperError('level is required.');
    }

    const { ellipsoid } = tilingScheme;
    const nativeRectangle = tilingScheme.tileXYToNativeRectangle(x, y, level);
    const rectangle = tilingScheme.tileXYToRectangle(x, y, level);
    exaggeration = Cesium.defaultValue(exaggeration, 1.0);

    // Compute the center of the tile for RTC rendering.
    const center = ellipsoid.cartographicToCartesian(Cesium.Rectangle.center(rectangle));

    const structure = this._structure;

    const levelZeroMaxError = Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(ellipsoid, this._width, tilingScheme.getNumberOfXTilesAtLevel(0));
    const thisLevelMaxError = levelZeroMaxError / (1 << level);
    this._skirtHeight = Math.min(thisLevelMaxError * 4.0, 1000.0);

    if (!Cesium.HeightmapTerrainData.___taskProcessor) Cesium.HeightmapTerrainData.___taskProcessor = new Cesium.TaskProcessor('GSI_createVerticesFromHeightmap'); // okw

    const verticesPromise = Cesium.HeightmapTerrainData.___taskProcessor.scheduleTask({
        heightmap: this._buffer,
        structure,
        includeWebMercatorT: true,
        width: this._width,
        height: this._height,
        nativeRectangle,
        rectangle,
        relativeToCenter: center,
        ellipsoid,
        skirtHeight: this._skirtHeight,
        isGeographic: tilingScheme instanceof Cesium.GeographicTilingScheme,
        exaggeration,
    });

    if (!Cesium.defined(verticesPromise)) {
        // Postponed
        return undefined;
    }

    const that = this;
    return Cesium.when(verticesPromise, (result) => {
        that._mesh = new Cesium.TerrainMesh(
                center,
                new Float32Array(result.vertices),
                Cesium.TerrainProvider.getRegularGridIndices(result.gridWidth, result.gridHeight),
                result.minimumHeight,
                result.maximumHeight,
                result.boundingSphere3D,
                result.occludeePointInScaledSpace,
                result.numberOfAttributes,
                result.orientedBoundingBox,
                Cesium.TerrainEncoding.clone(result.encoding),
                exaggeration,
        );

        // Free memory received from server after mesh is created.
        that._buffer = undefined;
        return that._mesh;
    });
};
*/
