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

export default Ember.ArrayController.extend({
  needs: [ constants.namingConventions.databases,
           constants.namingConventions.loadedFiles,
           constants.namingConventions.jobResults,
           constants.namingConventions.jobExplain,
           constants.namingConventions.columns,
           constants.namingConventions.index,
           constants.namingConventions.settings
         ],

  databases: Ember.computed.alias('controllers.' + constants.namingConventions.databases),

  files: Ember.computed.alias('controllers.' + constants.namingConventions.loadedFiles),

  jobResults: Ember.computed.alias('controllers.' + constants.namingConventions.jobResults),

  jobExplain: Ember.computed.alias('controllers.' + constants.namingConventions.jobExplain),

  index: Ember.computed.alias('controllers.' + constants.namingConventions.index),

  settings: Ember.computed.alias('controllers.' + constants.namingConventions.settings),

  init: function () {
    this._super();

    this.set('queryTabs', Ember.ArrayProxy.create({ content: Ember.A([])}));
  },

  pushObject: function (queryFile, model) {
    return this._super(queryFile || Ember.Object.create({
      id: model.get('id'),
      fileContent: ""
    }));
  },

  getTabForModel: function (model) {
    return this.get('queryTabs').find(function (tab) {
      return tab.id === model.get('id') && tab.type === model.get('constructor.typeKey');
    });
  },

  updateTabSubroute: function (model, path) {
    var tab = this.get('queryTabs').find(function (tab) {
      return tab.id === model.get('id') && tab.type === model.get('constructor.typeKey');
    });

    if (tab) {
      tab.set('subroute', path);
    }
  },

  getQueryForModel: function (model) {
    return this.find(function (openQuery) {
      if (model.get('isNew')) {
        return openQuery.get('id') === model.get('id');
      }

      return openQuery.get('id') === model.get('queryFile');
    });
  },

  update: function (model) {
    var path,
        type,
        currentQuery,
        defer = Ember.RSVP.defer(),
        existentTab,
        self = this,
        updateSubroute = function () {
          var isExplainedQuery,
              subroute;

          //jobs that were run from hive ui (exclude ats jobs)
          if (model.get('constructor.typeKey') === constants.namingConventions.job &&
              utils.isInteger(model.get('id'))) {
            isExplainedQuery = self.get('currentQuery.fileContent').indexOf(constants.namingConventions.explainPrefix) > -1;

            if (isExplainedQuery) {
              subroute = constants.namingConventions.subroutes.jobExplain;
            } else {
              subroute = constants.namingConventions.subroutes.jobLogs;
            }

            if (!existentTab.get('subroute')) {
              self.updateTabSubroute(model, subroute);
            }
          }

          defer.resolve(isExplainedQuery);
        };

    existentTab = this.getTabForModel(model);

    if (!existentTab) {
      type = model.get('constructor.typeKey');
      path = type === constants.namingConventions.job ?
             constants.namingConventions.subroutes.historyQuery :
             constants.namingConventions.subroutes.savedQuery;

      existentTab = this.get('queryTabs').pushObject(Ember.Object.create({
        name: model.get('title'),
        id: model.get('id'),
        visible: true,
        path: path,
        type: type
      }));

      if (model.get('isNew')) {
        this.set('currentQuery', this.pushObject(null, model));

        defer.resolve();
      } else {
        this.get('files').loadFile(model.get('queryFile')).then(function (file) {
          self.set('currentQuery', self.pushObject(file));

          updateSubroute();
        });

        if (model.get('logFile') && !model.get('log')) {
          this.get('files').loadFile(model.get('logFile')).then(function (file) {
            model.set('log', file.get('fileContent'));
          });
        }
      }
    } else {
      currentQuery = this.getQueryForModel(model);
      this.set('currentQuery', currentQuery);

      updateSubroute();
    }

    return defer.promise;
  },

  save: function (model, query, isUpdating, newTitle) {
    var tab = this.getTabForModel(model),
        self = this,
        wasNew,
        defer = Ember.RSVP.defer(),
        jobModel = model,
        originalId = model.get('id');

    if (!query) {
      query = this.getQueryForModel(model);
    }

    if (model.get('isNew')) {
      wasNew = true;
      model.set('title', newTitle);
      model.set('id', null);
    }

    //if current query it's a job, convert it to a savedQuery before saving
    if (model.get('constructor.typeKey') === constants.namingConventions.job) {
      model = this.store.createRecord(constants.namingConventions.savedQuery, {
        dataBase: this.get('databases.selectedDatabase.name'),
        title: newTitle,
        queryFile: model.get('queryFile'),
        owner: model.get('owner')
      });
    }

    tab.set('name', newTitle);

    //if saving a new query from an existing one create a new record and save it
    if (!isUpdating && !model.get('isNew') && model.get('constructor.typeKey') !== constants.namingConventions.job) {
      model = this.store.createRecord(constants.namingConventions.savedQuery, {
        dataBase: this.get('databases.selectedDatabase.name'),
        title: newTitle,
        owner: model.get('owner')
      });

      wasNew = true;
    }

    model.save().then(function (updatedModel) {
      jobModel.set('queryId', updatedModel.get('id'));

      tab.set('isDirty', false);

      var content = query.get('fileContent');
      //update query tab path with saved model id if its a new record
      if (wasNew) {
        self.get('settings').updateSettingsId(originalId, updatedModel.get('id'));
        tab.set('id', updatedModel.get('id'));

        self.get('files').loadFile(updatedModel.get('queryFile')).then(function (file) {
          file.set('fileContent', content);
          file.save().then(function (updatedFile) {
            self.removeObject(query);
            self.pushObject(updatedFile);
            self.set('currentQuery', updatedFile);

            defer.resolve(updatedModel.get('id'));
          }, function (err) {
            defer.reject(err);
          });
        }, function (err) {
          defer.reject(err);
        });
      } else {
        query.set('fileContent', content);
        query.save().then(function () {
          self.toggleProperty('tabUpdated');
          defer.resolve(updatedModel.get('id'));
        }, function (err) {
          defer.reject(err);
        });
      }
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  },

  convertTabToJob: function (model, job) {
    var defer = Ember.RSVP.defer(),
        oldQuery = this.getQueryForModel(model),
        tab = this.getTabForModel(model),
        jobId = job.get('id'),
        self = this;

    tab.set('id', job.get('id'));
    tab.set('type', constants.namingConventions.job);
    tab.set('path', constants.namingConventions.subroutes.historyQuery);

    this.get('files').loadFile(job.get('queryFile')).then(function (file) {
      //replace old model representing file to reflect model update to job
      if (self.keepOriginalQuery(jobId)) {
        file.set('fileContent', oldQuery.get('fileContent'));
      }

      self.removeObject(oldQuery);
      self.pushObject(file);

      defer.resolve();
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  },

  keepOriginalQuery: function (jobId) {
    var selected = this.get('highlightedText');
    var hasQueryParams = this.get('index.queryParams.length');
    var hasSettings = this.get('settings').hasSettings(jobId);

    return selected && selected[0] !== "" ||
         hasQueryParams ||
         hasSettings;
  },

  isDirty: function (model) {
    var query = this.getQueryForModel(model);

    if (model.get('isNew') && !query.get('fileContent')) {
      return false;
    }

    if (query && query.get('isDirty')) {
      return true;
    }

    return !!(!model.get('queryId') && model.get('isDirty'));
  },

  updatedDeletedQueryTab: function (model) {
    var tab = this.getTabForModel(model);

    if (tab) {
      this.closeTab(tab);
    }
  },

  dirtyObserver: function () {
    var tab;
    var model = this.get('index.model');

    if (model) {
      tab = this.getTabForModel(model);

      if (tab) {
        tab.set('isDirty', this.isDirty(model));
      }
    }
  }.observes('currentQuery.isDirty', 'currentQuery.fileContent'),

  closeTab: function (tab, goToNextTab) {
    var remainingTabs = this.get('queryTabs').without(tab);

    this.set('queryTabs', remainingTabs);

    //remove cached results set
    if (tab.type === constants.namingConventions.job) {
      this.get('jobResults').clearCachedResultsSet(tab.id);
      this.get('jobExplain').clearCachedExplainSet(tab.id);
    }

    if (goToNextTab) {
      this.navigateToLastTab();
    }
  },

  navigateToLastTab: function () {
    var lastTab = this.get('queryTabs.lastObject');

    if (lastTab) {
      if (lastTab.type === constants.namingConventions.job) {
        this.transitionToRoute(constants.namingConventions.subroutes.historyQuery, lastTab.id);
      } else {
        this.transitionToRoute(constants.namingConventions.subroutes.savedQuery, lastTab.id);
      }
    } else {
      this.get('index').send('addQuery');
    }
  },

  actions: {
    removeQueryTab: function (tab) {
      var self = this,
          defer;

      this.store.find(tab.type, tab.id).then(function (model) {
        var query = self.getQueryForModel(model);

        if (!self.isDirty(model)) {
          self.closeTab(tab, true);
        } else {
          defer = Ember.RSVP.defer();
          self.send('openModal',
                    'modal-save',
                     {
                        heading: "modals.save.saveBeforeCloseHeading",
                        text: model.get('title'),
                        defer: defer
                     });

          defer.promise.then(function (text) {
            model.set('title', text);
            self.save(model, query).then(function () {
              self.closeTab(tab, true);
            });
          }, function () {
            model.rollback();
            self.closeTab(tab, true);
          });
        }
      });
    },

    getColumnsForAutocomplete: function (tableName, callback) {
      this.get('databases').getAllColumns(tableName).then(function () {
        callback();
      });
    },

    changeTabTitle: function(tab) {
      var self = this,
          defer = Ember.RSVP.defer(),
          title = this.get('index.content.title');

      this.send('openModal', 'modal-save', {
        heading: 'modals.changeTitle.heading',
        text: title,
        defer: defer
      });

      defer.promise.then(function (result) {
        self.set('index.model.title', result);
        tab.set('name', result);
      });
    }
  }
});
