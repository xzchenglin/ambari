/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Ember from 'ember';
import constants from 'hive/utils/constants';
import utils from 'hive/utils/functions';

export default Ember.ObjectController.extend({
  needs: [ constants.namingConventions.history, constants.namingConventions.loadedFiles ],

  files: Ember.computed.alias('controllers.' + constants.namingConventions.loadedFiles),

  canStop: function () {
    return utils.insensitiveCompare(this.get('status'), constants.statuses.running, constants.statuses.initialized, constants.statuses.pending);
  }.property('status'),

  actions: {
    loadFile: function () {
      var self = this;
      if (!this.get('file')) {
        this.get('files').loadFile(this.get('model.queryFile')).then(function (file) {
          self.set('file', file);
        });
      }

      this.set('expanded', !this.get('expanded'));
    },

    stop: function () {
      this.send('interruptJob', this.get('model'));
    }
  }
});
