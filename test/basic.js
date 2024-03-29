/* BetterTradeHistory / test / basic.js
 * basic test
 * (c) 2019 David (daXXog) Volm ><> + + + <><
 * Released under Apache License, Version 2.0:
 * http://www.apache.org/licenses/LICENSE-2.0.html  
 */

var vows = require('vows'),
    assert = require('assert'),
    BetterTradeHistory = require('../better-trade-history.min.js');

vows.describe('basic').addBatch({
    'BetterTradeHistory': {
        topic: function() {
        	return typeof BetterTradeHistory;
        },
        'is a function': function(topic) {
            assert.equal(topic, 'function');
        }
    }
}).export(module);