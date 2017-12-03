import path from 'path'
import fs from 'fs'
import glob from 'glob'
import _ from 'lodash'
import Promise from 'bluebird'

const validateFlowName = name => /^[a-z]{1}[a-z_0-9-]{1,20}$/.test(name)

module.exports = ({ logger, botfile, projectLocation }) => {
  const scanFlows = async () => {
    const relDir = botfile.flowsDir || './flows'
    const flowsDir = path.resolve(projectLocation, relDir)

    if (!fs.existsSync(flowsDir)) {
      return []
    }

    const searchOptions = { cwd: flowsDir }

    const flowFiles = await Promise.fromCallback(callback => glob('**/*.flow.json', searchOptions, callback))
    const uiFiles = await Promise.fromCallback(callback => glob('**/*.ui.json', searchOptions, callback))

    const flows = []

    flowFiles.forEach(file => {
      const filePath = path.resolve(flowsDir, './' + file)
      const flow = JSON.parse(fs.readFileSync(filePath))

      const uiEqPath = file.replace(/\.flow/g, '.ui')
      const uiEq = _.find(uiFiles, e => e === uiEqPath) || {}

      // Schema Validation
      const errorPrefix = `[Flow] Error loading "${file}"`
      if (!flow || !_.isObjectLike(flow)) {
        return logger.warn(errorPrefix + ', invalid JSON flow schema')
      }

      if (!flow.version || !_.isString(flow.version)) {
        return logger.warn(errorPrefix + ', expected valid version but found none')
      }

      if (!flow.version.startsWith('0.')) {
        return logger.warn(errorPrefix + ', unsupported `version` of the schema "' + flow.version + '"')
      }

      if (!_.isString(flow.name) || !validateFlowName(flow.name)) {
        return logger.warn(errorPrefix + ', expected valid `name`')
      }

      if (!_.isString(flow.startnode)) {
        return logger.warn(errorPrefix + ', expected valid `startnode`')
      }

      if (!_.isArray(flow.nodes)) {
        return logger.warn(errorPrefix + ', expected `nodes` to be an array of nodes')
      }

      if (!_.find(flow.nodes, { name: flow.startnode })) {
        return logger.warn(errorPrefix + ', expected `startnode` to point to an existing flow node')
      }

      const unplacedNodes = []

      flow.nodes = _.map(flow.nodes, node => {
        // TODO Better node validation
        if (!_.isString(node.id) || node.id.length <= 3) {
          logger.warn(errorPrefix + ', expected all nodes to have a valid id')
          return null
        }

        const uiNode = _.find(uiEq.nodes, { id: node.id }) || {}

        if (_.isNil(uiNode.x) || _.isNil(uiNode.y)) {
          unplacedNodes.push(node)
        }

        if (_.isString(node.onEnter)) {
          node.onEnter = [node.onEnter]
        }

        if (_.isString(node.onReceive)) {
          node.onReceive = [node.onReceive]
        }

        if (_.isString(node.next)) {
          node.next = [node.next]
        }

        return _.merge(node, uiNode)
      })

      const unplacedY = (_.maxBy(flow.nodes, 'y') || { y: 0 }).y + 250
      let unplacedX = 50

      unplacedNodes.forEach(node => {
        node.y = unplacedY
        node.x = unplacedX
        unplacedX += 200
      })

      return flows.push({
        location: file,
        version: flow.version,
        name: flow.name,
        nodes: _.filter(flow.nodes, node => !!node),
        startnode: flow.startnode
      })
    })

    return flows
  }

  const loadFlows = async () => {}

  return { scanFlows, loadFlows }
}